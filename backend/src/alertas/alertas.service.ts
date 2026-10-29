import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Like, Repository } from 'typeorm';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { ContratoItem } from '../contratos/entities/contrato-item.entity';
import { Volumen } from '../calculo/entities/volumen.entity';
import { VariacionesService } from '../variaciones/variaciones.service';
import { ListAlertasQueryDto } from './dto/list-alertas-query.dto';
import { Alerta, AlertasResultado, diasSinRevisar, ResumenAlertas, SeveridadAlerta, TipoAlerta } from './alertas.types';
import { AlertaRevision } from './entities/alerta-revision.entity';
import { RevisarAlertaDto } from './dto/revisar-alerta.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';

// 30 días: Comercial revisa las renovaciones semana a semana y necesita margen para enviarlas.
const DIAS_POR_VENCER = 30;

/**
 * Genera las alertas en vivo, sobre el estado actual de la base — sin tabla ni
 * estado de "leído/descartado" (decisión tomada: una alerta desaparece SOLO
 * cuando el problema real se corrige). Mismo patrón que
 * ReconciliacionService.sugerencias(): computado en cada consulta.
 */
@Injectable()
export class AlertasService {
  constructor(
    @InjectRepository(Cliente) private readonly clientesRepo: Repository<Cliente>,
    @InjectRepository(Contrato) private readonly contratosRepo: Repository<Contrato>,
    @InjectRepository(ContratoItem) private readonly itemsRepo: Repository<ContratoItem>,
    @InjectRepository(Volumen) private readonly volumenesRepo: Repository<Volumen>,
    @InjectRepository(AlertaRevision) private readonly revisionesRepo: Repository<AlertaRevision>,
    private readonly variaciones: VariacionesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async generar(query: ListAlertasQueryDto = {}): Promise<AlertasResultado> {
    const hoy = new Date();
    const anioActual = hoy.getFullYear();
    const mesActual = hoy.getMonth() + 1;

    const alertas: Alerta[] = [
      ...(await this.alertasTarifa(anioActual)),
      ...(await this.alertasNitPendiente()),
      ...(await this.alertasVolumenSinEnlazar(anioActual, mesActual)),
      ...(await this.alertasVigencia(hoy)),
      ...(await this.alertasVariacion()),
    ];

    const visibles = await this.aplicarRevisiones(alertas, !!query.incluirRevisadas);
    const filtradas = visibles.filter(
      (a) => (!query.tipo || a.tipo === query.tipo) && (!query.severidad || a.severidad === query.severidad),
    );

    return { resumen: this.resumir(filtradas), alertas: filtradas };
  }

  async resumen(): Promise<ResumenAlertas> {
    const { resumen } = await this.generar();
    return resumen;
  }

  /** contrato_item activo (de contrato y cliente activos) sin tarifa del año actual, o incompleta. */
  private async alertasTarifa(anioActual: number): Promise<Alerta[]> {
    const items = await this.itemsRepo
      .createQueryBuilder('ci')
      .innerJoinAndSelect('ci.contrato', 'co')
      .innerJoinAndSelect('co.cliente', 'cli')
      .leftJoinAndSelect('ci.escalones', 'esc')
      .leftJoinAndSelect('ci.minimos', 'min')
      .leftJoinAndSelect('ci.tarifasFijas', 'fija')
      .where('ci.estado = :activo', { activo: 'activo' })
      .andWhere('co.estado = :activo', { activo: 'activo' })
      .andWhere('cli.estado = :activo', { activo: 'activo' })
      .getMany();

    const out: Alerta[] = [];
    for (const item of items) {
      const anios = new Set<number>([
        ...item.escalones.map((e) => e.anio),
        ...item.minimos.map((m) => m.anio),
        ...item.tarifasFijas.map((f) => f.anio),
      ]);

      const tieneAnioActual = {
        escalon: item.escalones.some((e) => e.anio === anioActual),
        minimo: item.minimos.some((m) => m.anio === anioActual),
        minimoConTope: item.minimos.some((m) => m.anio === anioActual && m.volumenTope != null),
        fija: item.tarifasFijas.some((f) => f.anio === anioActual),
      };

      const requiereEscalon =
        item.modeloCobro === 'volumen_escalonado' ||
        item.modeloCobro === 'minimo_garantizado' ||
        item.modeloCobro === 'bolsa';
      const requiereMinimo = item.modeloCobro === 'minimo_garantizado';
      const requiereFija = item.modeloCobro === 'fijo_mensual';

      const faltaEscalon = requiereEscalon && !tieneAnioActual.escalon;
      const faltaMinimo = requiereMinimo && !tieneAnioActual.minimo;
      // Mínimo cargado pero sin el tope de la franquicia (ver motor): el cálculo fallaría igual.
      const faltaTopeMinimo = requiereMinimo && tieneAnioActual.minimo && !tieneAnioActual.minimoConTope;
      const faltaFija = requiereFija && !tieneAnioActual.fija;

      if (!faltaEscalon && !faltaMinimo && !faltaTopeMinimo && !faltaFija) continue;

      const sinNadaDelAnio = !anios.has(anioActual);
      const ultimoAnio = anios.size ? Math.max(...anios) : null;

      const base = {
        clienteId: item.contrato.cliente.id,
        clienteNombre: item.contrato.cliente.razonSocial,
        contratoId: item.contrato.id,
        contratoNombre: item.contrato.nombreContrato,
        detalle: { contratoItemId: item.id, modeloCobro: item.modeloCobro, ultimoAnio },
      };

      if (sinNadaDelAnio) {
        out.push({
          ...base,
          tipo: 'desactualizado',
          severidad: 'alta',
          mensaje: ultimoAnio
            ? `Sin tarifa ${anioActual}; la última cargada es de ${ultimoAnio}.`
            : `Sin ninguna tarifa cargada (modelo ${item.modeloCobro}).`,
        });
      } else {
        const faltantes = [
          faltanteLabel('escalones', faltaEscalon),
          faltanteLabel('valor mínimo', faltaMinimo),
          faltanteLabel('tope del mínimo garantizado', faltaTopeMinimo),
          faltanteLabel('valor fijo', faltaFija),
        ]
          .filter(Boolean)
          .join(', ');
        out.push({
          ...base,
          tipo: 'tarifa_incompleta',
          severidad: 'alta',
          mensaje: `Tiene datos de ${anioActual} pero falta ${faltantes} — no se puede liquidar este año.`,
        });
      }
    }
    return out;
  }

  /** Cliente activo con NIT placeholder (migración sin cruce de NIT real). */
  private async alertasNitPendiente(): Promise<Alerta[]> {
    const pendientes = await this.clientesRepo.find({
      where: { estado: 'activo', nit: Like('PEND-%') },
    });
    return pendientes.map((c) => ({
      tipo: 'nit_pendiente' as const,
      severidad: 'media' as const,
      clienteId: c.id,
      clienteNombre: c.razonSocial,
      mensaje: 'NIT pendiente de confirmar — no se puede facturar legalmente con un NIT provisional.',
    }));
  }

  /** Volumen del periodo actual que no quedó enlazado a ningún contrato_item. */
  private async alertasVolumenSinEnlazar(anio: number, mes: number): Promise<Alerta[]> {
    const volumenes = await this.volumenesRepo.find({
      where: { anio, mes, contratoItemId: IsNull() },
      relations: { cliente: true },
    });
    return volumenes.map((v) => ({
      tipo: 'volumen_sin_enlazar' as const,
      severidad: 'alta' as const,
      clienteId: v.clienteId,
      clienteNombre: v.cliente?.razonSocial ?? `cliente #${v.clienteId}`,
      mensaje: `Volumen de ${mes}/${anio} sin contrato enlazado — no se puede liquidar.`,
      detalle: { volumenId: v.id, cantidad: v.cantidad },
    }));
  }

  /** Contrato activo con vigenciaHasta vencida o dentro de los próximos DIAS_POR_VENCER días. */
  private async alertasVigencia(hoy: Date): Promise<Alerta[]> {
    const contratos = await this.contratosRepo.find({
      where: { estado: 'activo' },
      relations: { cliente: true },
    });
    const limite = new Date(hoy);
    limite.setDate(limite.getDate() + DIAS_POR_VENCER);

    const out: Alerta[] = [];
    for (const c of contratos) {
      if (!c.vigenciaHasta) continue;
      const fin = new Date(c.vigenciaHasta);
      if (fin < hoy) {
        out.push({
          tipo: 'vencido',
          severidad: 'critica',
          clienteId: c.cliente.id,
          clienteNombre: c.cliente.razonSocial,
          contratoId: c.id,
          contratoNombre: c.nombreContrato,
          mensaje: `Contrato vencido el ${c.vigenciaHasta}.`,
        });
      } else if (fin <= limite) {
        out.push({
          tipo: 'por_vencer',
          severidad: 'alta',
          clienteId: c.cliente.id,
          clienteNombre: c.cliente.razonSocial,
          contratoId: c.id,
          contratoNombre: c.nombreContrato,
          mensaje: `Contrato vence el ${c.vigenciaHasta} (en ${Math.ceil((fin.getTime() - hoy.getTime()) / 86_400_000)} días).`,
        });
      }
    }
    return out;
  }

  /** Marca revisadas las alertas de variación; sin `incluir`, las quita de la lista. */
  private async aplicarRevisiones(alertas: Alerta[], incluir: boolean): Promise<Alerta[]> {
    const claves = alertas.map((a) => a.clave).filter((c): c is string => !!c);
    if (!claves.length) return alertas;
    const revisiones = new Map<string, AlertaRevision>();
    for (let i = 0; i < claves.length; i += 1000) {
      for (const r of await this.revisionesRepo.find({ where: { clave: In(claves.slice(i, i + 1000)) } })) revisiones.set(r.clave, r);
    }
    const out: Alerta[] = [];
    for (const a of alertas) {
      const r = a.clave ? revisiones.get(a.clave) : undefined;
      if (!r) {
        out.push(a);
        continue;
      }
      const revision = { motivo: r.motivo, nota: r.nota, usuario: r.usuario, fecha: r.fecha };
      const nuevos = diasSinRevisar(a, r.dias ? (JSON.parse(r.dias) as string[]) : []);
      if (nuevos.length) out.push({ ...a, revision, diasNuevos: nuevos });
      else if (incluir) out.push({ ...a, revision });
    }
    return out;
  }

  /**
   * Contabilidad marca una alerta de variación como revisada. Se guarda qué días
   * vio: si después aparecen días nuevos fuera de lo normal, la alerta vuelve.
   */
  async revisar(dto: RevisarAlertaDto, usuario: string): Promise<AlertaRevision> {
    const alerta = (await this.alertasVariacion()).find((a) => a.clave === dto.clave);
    if (!alerta) throw new NotFoundException('La alerta ya no está vigente (puede que se haya recargado el mes). Actualice la lista.');
    const dias = ((alerta.detalle?.dias as { fecha: string }[] | undefined) ?? []).map((d) => d.fecha);
    const anterior = await this.revisionesRepo.findOne({ where: { clave: dto.clave } });
    const guardada = await this.revisionesRepo.save(
      this.revisionesRepo.merge(anterior ?? this.revisionesRepo.create({ clave: dto.clave }), {
        tipo: alerta.tipo,
        clienteId: alerta.clienteId || null,
        servicio: typeof alerta.detalle?.servicio === 'string' ? alerta.detalle.servicio : null,
        periodo: typeof alerta.detalle?.periodo === 'string' ? alerta.detalle.periodo : null,
        motivo: dto.motivo,
        nota: dto.nota?.trim() || null,
        dias: JSON.stringify(dias),
        usuario,
        fecha: new Date(),
      }),
    );
    await this.auditoria.registrar({
      tabla: 'alertas_revision',
      registroId: guardada.id,
      usuario,
      accion: anterior ? 'UPDATE' : 'INSERT',
      valorAnterior: anterior ? { motivo: anterior.motivo, nota: anterior.nota, dias: anterior.dias } : undefined,
      valorNuevo: { clave: dto.clave, cliente: alerta.clienteNombre, motivo: dto.motivo, nota: guardada.nota, mensaje: alerta.mensaje },
    });
    return guardada;
  }

  /**
   * Comportamiento inusual en el último mes cargado de Data. Estas no se
   * "corrigen": las revisa Contabilidad mirando la gráfica del cliente.
   */
  private async alertasVariacion(): Promise<Alerta[]> {
    const a = await this.variaciones.analizarUltimo();
    if (!a) return [];
    const n = (v: number) => Math.round(v).toLocaleString('es-CO');
    const pct = (v: number) => (v > 5 ? `más de 5 veces lo normal` : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')}%`);
    const pesos = (v: number | null) => (v == null ? '' : ` (≈ ${v < 0 ? '-' : '+'}$${n(Math.abs(v))} a precio promedio)`);
    const fechaCorta = (f: string) => `${Number(f.slice(8))}-${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(f.slice(5, 7)) - 1]}`;
    const MARCA = { caida: 'bajó', cero: 'en cero', alza: 'subió' } as const;

    return [
      ...a.generales.map((g) => ({
        tipo: 'caida_general' as const,
        severidad: 'critica' as const,
        clienteId: 0,
        clienteNombre: `${g.nits.length} clientes`,
        clave: `caida_general|${g.fecha}`,
        mensaje:
          `El ${fechaCorta(g.fecha)} cayeron a la vez ${g.seriesCaidas} de ${g.seriesEvaluadas} servicios ` +
          `(≈ ${n(g.transaccionesFaltantes)} transacciones menos). Parece un evento de la plataforma o de Data, no de los clientes: confirmar con Data.`,
        detalle: { ...g, periodo: g.fecha.slice(0, 7) },
      })),
      ...a.variaciones.map((v) => ({
        tipo: 'variacion_diaria' as const,
        severidad: v.severidad,
        clienteId: v.cliente.id,
        clienteNombre: v.cliente.razonSocial,
        clave: `variacion_diaria|${v.cliente.id}|${v.servicio}|${v.periodo}`,
        mensaje:
          `${v.servicio}: ${v.dias.length === 1 ? 'un día fuera de lo normal' : `${v.dias.length} días fuera de lo normal`} ` +
          `(${v.dias.slice(0, 4).map((d) => `${fechaCorta(d.fecha)} ${MARCA[d.marca]}`).join(', ')}${v.dias.length > 4 ? '…' : ''}). ` +
          `Mueve el mes ${pct(v.variacion)}, ${n(Math.abs(v.delta))} transacciones${pesos(v.impactoPesos)}.`,
        detalle: { servicio: v.servicio, periodo: v.periodo, dias: v.dias, delta: v.delta, variacion: v.variacion, impactoPesos: v.impactoPesos },
      })),
      ...a.mensuales.map((v) => ({
        tipo: 'variacion_mensual' as const,
        severidad: v.severidad,
        clienteId: v.cliente.id,
        clienteNombre: v.cliente.razonSocial,
        clave: `variacion_mensual|${v.cliente.id}|${v.servicio}|${v.periodo}`,
        mensaje:
          `${v.servicio}: ${n(v.total)} transacciones en ${v.periodo} contra un promedio de ${n(v.base)} ` +
          `(${v.mesesBase.join(', ')}): ${pct(v.variacion)}${pesos(v.impactoPesos)}.` +
          (v.mismoMesAnioAnterior != null ? ` Mismo mes del año anterior: ${n(v.mismoMesAnioAnterior)}.` : ''),
        detalle: { servicio: v.servicio, periodo: v.periodo, total: v.total, base: v.base, variacion: v.variacion, impactoPesos: v.impactoPesos },
      })),
    ];
  }

  private resumir(alertas: Alerta[]): ResumenAlertas {
    const porTipo = {} as Record<TipoAlerta, number>;
    const porSeveridad = {} as Record<SeveridadAlerta, number>;
    for (const a of alertas) {
      porTipo[a.tipo] = (porTipo[a.tipo] ?? 0) + 1;
      porSeveridad[a.severidad] = (porSeveridad[a.severidad] ?? 0) + 1;
    }
    return { total: alertas.length, porTipo, porSeveridad };
  }
}

function faltanteLabel(nombre: string, falta: boolean): string | null {
  return falta ? nombre : null;
}
