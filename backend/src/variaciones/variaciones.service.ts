import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Cliente } from '../clientes/entities/cliente.entity';
import { PreLiquidado } from '../calculo/entities/pre-liquidado.entity';
import { VolumenDiario, VolumenDiarioPeriodo } from './entities/volumen-diario.entity';
import { rangoDias } from './festivos';
import { agruparVolumenes, leerFilasCsv } from '../empalme/volumenes-bigquery';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  DiaEvaluado,
  detectarVariaciones,
  detectarVariacionMensual,
  evaluarSerie,
  EventoGeneral,
  SerieDiaria,
  VariacionMensual,
  VariacionSerie,
} from './reglas';

export interface FilaDiaria {
  fecha: string;
  nit: string;
  servicio: string;
  cantidad: number;
}

export interface AnalisisPeriodo {
  /** Último mes cargado (puede ir a medias). */
  periodo: string;
  /** Meses analizados: el último cerrado y el que va corriendo. */
  periodos: string[];
  generales: EventoGeneral[];
  variaciones: (VariacionSerie & { cliente: Pick<Cliente, 'id' | 'razonSocial'>; impactoPesos: number | null })[];
  mensuales: (VariacionMensual & { cliente: Pick<Cliente, 'id' | 'razonSocial'>; impactoPesos: number | null })[];
}

export interface MesVela {
  periodo: string;
  total: number;
  /** Primer y último día del mes, día más bajo y más alto (vela). */
  apertura: number;
  cierre: number;
  minimo: number;
  maximo: number;
  completo: boolean;
}

export interface SerieCliente {
  cliente: { id: number; nit: string; razonSocial: string };
  servicios: { servicio: string; total: number }[];
  /** null = todos los servicios sumados. */
  servicio: string | null;
  cobertura: { desde: string; hasta: string } | null;
  dias: DiaEvaluado[];
  meses: MesVela[];
  variaciones: AnalisisPeriodo['variaciones'];
  mensuales: AnalisisPeriodo['mensuales'];
}

const LOTE = 500; // 4 parámetros por fila: SQL Server admite ~2.100 por consulta
const ultimoDiaMes = (periodo: string) => {
  const [a, m] = periodo.split('-').map(Number);
  return `${periodo}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/**
 * Volumen diario de Data y variaciones de comportamiento por cliente.
 * Se alimenta en cada liquidación (CSV o BigQuery); las alertas se calculan
 * sobre lo guardado y se cachean hasta la próxima carga.
 */
@Injectable()
export class VariacionesService {
  private cache: AnalisisPeriodo | null = null;

  constructor(
    @InjectRepository(VolumenDiario) private readonly diarioRepo: Repository<VolumenDiario>,
    @InjectRepository(VolumenDiarioPeriodo) private readonly periodosRepo: Repository<VolumenDiarioPeriodo>,
    @InjectRepository(Cliente) private readonly clientesRepo: Repository<Cliente>,
    @InjectRepository(PreLiquidado) private readonly preRepo: Repository<PreLiquidado>,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Histórico de transacciones desde el export de Data (puede traer varios meses).
   * Solo guarda el volumen diario: NO liquida ni crea cobros (esos meses ya se
   * facturaron por fuera). Cada mes se reemplaza completo.
   */
  async cargarHistorico(texto: string, usuario: string) {
    const filas = leerFilasCsv(texto);
    const periodos = [...new Set(filas.map((f) => f.fecha.slice(0, 7)))].filter((p) => /^\d{4}-\d{2}$/.test(p)).sort();
    const cargados: { periodo: string; filas: number; transacciones: number; hasta: string }[] = [];
    const errores: { periodo: string; mensaje: string }[] = [];
    for (const periodo of periodos) {
      try {
        const v = agruparVolumenes(filas, periodo);
        await this.diarioRepo.manager.transaction((m) => this.guardarPeriodo(m, periodo, v.diario, 'historico_csv'));
        cargados.push({
          periodo,
          filas: v.filas,
          transacciones: v.diario.reduce((a, d) => a + d.cantidad, 0),
          hasta: v.diario.reduce((max, d) => (d.fecha > max ? d.fecha : max), `${periodo}-01`),
        });
      } catch (e) {
        errores.push({ periodo, mensaje: (e as Error).message });
      }
    }
    await this.auditoria.registrar({
      tabla: 'volumen_diario',
      registroId: 0,
      usuario,
      accion: 'INSERT',
      valorNuevo: { origen: 'historico_csv', periodos: cargados.map((c) => c.periodo), errores },
    });
    return { periodos: cargados, errores };
  }

  /** Reemplaza el volumen diario del periodo (dentro de la transacción de la liquidación). */
  async guardarPeriodo(m: EntityManager, periodo: string, filas: FilaDiaria[], origen: string): Promise<void> {
    const desde = `${periodo}-01`;
    const fin = ultimoDiaMes(periodo);
    await m.createQueryBuilder().delete().from(VolumenDiario).where('fecha BETWEEN :desde AND :fin', { desde, fin }).execute();
    for (let i = 0; i < filas.length; i += LOTE) {
      await m.createQueryBuilder().insert().into(VolumenDiario).values(filas.slice(i, i + LOTE)).execute();
    }
    // Hasta el último día con datos: el mes en curso queda parcial y no se compara como mes completo.
    const hasta = filas.reduce((max, f) => (f.fecha > max ? f.fecha : max), desde);
    await m.save(VolumenDiarioPeriodo, m.create(VolumenDiarioPeriodo, {
      periodo, desde, hasta, filas: filas.length, transacciones: filas.reduce((a, f) => a + f.cantidad, 0), origen, fechaCarga: new Date(),
    }));
    this.cache = null;
  }

  async periodos(): Promise<VolumenDiarioPeriodo[]> {
    return this.periodosRepo.find({ order: { periodo: 'ASC' } });
  }

  /** Alertas del último mes cargado (caché hasta la próxima carga). */
  async analizarUltimo(): Promise<AnalisisPeriodo | null> {
    if (this.cache) return this.cache;
    const periodos = await this.periodos();
    if (!periodos.length) return null;
    const ultimo = periodos[periodos.length - 1];
    const cobertura = this.diasCubiertos(periodos);
    const series = await this.series(undefined, cobertura);

    // Se revisa el último mes cerrado (el que se factura) y el que va corriendo.
    const completos = periodos.filter((p) => p.hasta === ultimoDiaMes(p.periodo)).map((p) => p.periodo);
    const ultimoCompleto = completos[completos.length - 1];
    const analizados = [...new Set([ultimoCompleto, ultimo.periodo].filter((p): p is string => !!p))].sort();
    const generales: EventoGeneral[] = [];
    const variaciones: VariacionSerie[] = [];
    for (const periodo of analizados) {
      const r = detectarVariaciones(series, periodo);
      generales.push(...r.generales);
      variaciones.push(...r.variaciones);
    }

    const mensuales: VariacionMensual[] = [];
    if (ultimoCompleto) {
      for (const s of series) {
        const totales = new Map<string, number>(periodos.map((p) => [p.periodo, 0]));
        for (const [f, c] of s.dias) totales.set(f.slice(0, 7), (totales.get(f.slice(0, 7)) ?? 0) + c);
        const v = detectarVariacionMensual(s.nit, s.servicio, totales, ultimoCompleto, completos);
        if (v) mensuales.push(v);
      }
    }

    // Solo clientes registrados: los NIT sin cliente ya salen en Empalme como "NIT sin contrato".
    const nits = [...new Set([...variaciones, ...mensuales].map((v) => v.nit))];
    const clientes = nits.length ? await this.clientesRepo.find({ where: { nit: In(nits), estado: 'activo' } }) : [];
    const porNit = new Map(clientes.map((c) => [c.nit, c]));
    // Precio promedio del mes analizado; si ese mes no se liquidó en la app, el más reciente que sí.
    const precios = new Map<string, Map<string, number>>();
    for (const p of analizados) precios.set(p, await this.preciosPromedio(p));
    const recientes = await this.preciosRecientes();
    const conCliente = <T extends { nit: string; servicio: string; periodo: string }>(v: T, delta: number) => {
      const c = porNit.get(v.nit)!;
      const clave = `${c.id}|${v.servicio}`;
      const unit = precios.get(v.periodo)?.get(clave) ?? recientes.get(clave);
      return { ...v, cliente: { id: c.id, razonSocial: c.razonSocial }, impactoPesos: unit != null ? Math.round(delta * unit) : null };
    };

    this.cache = {
      periodo: ultimo.periodo,
      periodos: analizados,
      generales,
      variaciones: variaciones.filter((v) => porNit.has(v.nit)).map((v) => conCliente(v, v.delta)),
      mensuales: mensuales.filter((v) => porNit.has(v.nit)).map((v) => conCliente(v, v.total - v.base)),
    };
    return this.cache;
  }

  /** Serie del cliente para la gráfica: un servicio o todos sumados. */
  async serieCliente(clienteId: number, servicio?: string): Promise<SerieCliente> {
    const cliente = await this.clientesRepo.findOne({ where: { id: clienteId } });
    if (!cliente) throw new NotFoundException(`No existe el cliente con id ${clienteId}`);
    const periodos = await this.periodos();
    const cobertura = this.diasCubiertos(periodos);
    const series = await this.series(cliente.nit, cobertura);
    const servicios = series
      .map((s) => ({ servicio: s.servicio, total: [...s.dias.values()].reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);

    const elegidas = servicio ? series.filter((s) => s.servicio === servicio) : series;
    const dias = new Map<string, number>(cobertura.map((f) => [f, 0]));
    for (const s of elegidas) for (const [f, c] of s.dias) dias.set(f, (dias.get(f) ?? 0) + c);

    const analisis = await this.analizarUltimo();
    const generales = new Set(analisis?.generales.map((g) => g.fecha) ?? []);
    const evaluados = cobertura.length ? evaluarSerie(dias, cobertura[0], cobertura[cobertura.length - 1], generales) : [];

    const meses: MesVela[] = periodos.map((p) => {
      const delMes = evaluados.filter((d) => d.fecha.startsWith(p.periodo)).map((d) => d.cantidad);
      return {
        periodo: p.periodo,
        total: delMes.reduce((a, b) => a + b, 0),
        apertura: delMes[0] ?? 0,
        cierre: delMes[delMes.length - 1] ?? 0,
        minimo: delMes.length ? Math.min(...delMes) : 0,
        maximo: delMes.length ? Math.max(...delMes) : 0,
        completo: p.hasta === ultimoDiaMes(p.periodo),
      };
    });

    const propias = <T extends { cliente: { id: number }; servicio: string }>(l: T[]) =>
      l.filter((v) => v.cliente.id === clienteId && (!servicio || v.servicio === servicio));
    return {
      cliente: { id: cliente.id, nit: cliente.nit, razonSocial: cliente.razonSocial },
      servicios,
      servicio: servicio ?? null,
      cobertura: cobertura.length ? { desde: cobertura[0], hasta: cobertura[cobertura.length - 1] } : null,
      dias: evaluados,
      meses,
      variaciones: propias(analisis?.variaciones ?? []),
      mensuales: propias(analisis?.mensuales ?? []),
    };
  }

  /** Todos los días de los periodos cargados (hasta el último día con datos de cada uno). */
  private diasCubiertos(periodos: VolumenDiarioPeriodo[]): string[] {
    return periodos.flatMap((p) => rangoDias(p.desde, p.hasta));
  }

  /** Series NIT+servicio con 0 en los días cubiertos sin transacciones. */
  private async series(nit: string | undefined, cobertura: string[]): Promise<SerieDiaria[]> {
    const qb = this.diarioRepo
      .createQueryBuilder('v')
      .select("CONVERT(char(10), v.fecha, 23)", 'fecha')
      .addSelect('v.nit', 'nit')
      .addSelect('v.servicio', 'servicio')
      .addSelect('v.cantidad', 'cantidad');
    if (nit) qb.where('v.nit = :nit', { nit });
    const filas: FilaDiaria[] = await qb.getRawMany();

    const porClave = new Map<string, SerieDiaria>();
    for (const f of filas) {
      const clave = `${f.nit}|${f.servicio}`;
      let s = porClave.get(clave);
      if (!s) {
        s = { nit: f.nit, servicio: f.servicio, dias: new Map(cobertura.map((d) => [d, 0])) };
        porClave.set(clave, s);
      }
      s.dias.set(f.fecha, Number(f.cantidad));
    }
    return [...porClave.values()];
  }

  /** Precio promedio del último mes liquidado de cada cliente y servicio. */
  private async preciosRecientes(): Promise<Map<string, number>> {
    const ult = await this.preRepo.createQueryBuilder('p').select(['p.anio', 'p.mes']).orderBy('p.anio', 'DESC').addOrderBy('p.mes', 'DESC').getOne();
    return ult ? this.preciosPromedio(`${ult.anio}-${String(ult.mes).padStart(2, '0')}`) : new Map();
  }

  /**
   * Precio promedio por transacción del periodo (subtotal / volumen del
   * pre-liquidado que cobra ese servicio): sirve para estimar en pesos cuánto
   * mueve una variación. En mínimos y bolsas es aproximado.
   */
  private async preciosPromedio(periodo: string): Promise<Map<string, number>> {
    const [anio, mes] = periodo.split('-').map(Number);
    const pre = await this.preRepo.find({ where: { anio, mes } });
    const out = new Map<string, number>();
    for (const p of pre) {
      if (!Number(p.volumen)) continue;
      let servicios: string[] = [];
      try {
        servicios = (JSON.parse(p.desglose ?? '{}') as { servicios?: string[] }).servicios ?? [];
      } catch {
        continue;
      }
      for (const s of servicios) out.set(`${p.clienteId}|${s}`, Number(p.subtotal) / Number(p.volumen));
    }
    return out;
  }
}
