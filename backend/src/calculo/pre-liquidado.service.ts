import Decimal from 'decimal.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { PreLiquidado } from './entities/pre-liquidado.entity';
import { Volumen } from './entities/volumen.entity';
import { ContratoItem } from '../contratos/entities/contrato-item.entity';
import { MotorCalculoService } from './motor-calculo.service';
import { TarifasService } from '../tarifas/tarifas.service';
import { ParametrosService } from '../parametros/parametros.service';
import { ErrorCalculo, ResultadoCalculo, TasasTributarias } from './tipos';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CalcularPeriodoDto } from './dto/calcular-periodo.dto';
import { ListPreliquidadosQueryDto } from './dto/list-preliquidados-query.dto';
import { buildPaginated, PaginatedResult } from '../common/dto/paginated-result';
import { TrmService } from '../parametros/trm.service';
import { aPesos } from './moneda';
import { FacturarPreliquidadoDto } from './dto/facturar-preliquidado.dto';

export interface ResultadoCalcularPeriodo {
  anio: number;
  mes: number;
  calculados: number;
  /** Ya aprobados o facturados: recalcular NO los toca (el gate humano no se deshace solo). */
  bloqueados: number;
  errores: { item: number; cliente: string; motivo: string }[];
}

/** Estados que una nueva corrida del motor no puede sobrescribir. */
export const ESTADOS_CERRADOS: readonly string[] = ['aprobado', 'facturado'];

/**
 * Copia el resultado del motor a la fila de pre-liquidado (todas las columnas
 * de trazabilidad + valores de factura). Deja la fila en 'calculado' y limpia
 * un rechazo anterior: un recálculo vuelve a pasar por revisión humana.
 */
export function asignarResultado(p: PreLiquidado, r: ResultadoCalculo, desglose: object): void {
  Object.assign(p, {
    volumen: r.volumen,
    modeloCobro: r.modeloCobro,
    anioTarifa: r.anioTarifa,
    tarifaUnitaria: r.tarifaUnitaria,
    recargoFijo: r.recargoFijo,
    subtotal: r.subtotal,
    tasaIva: r.iva.tasa,
    iva: r.iva.valor,
    total: r.total,
    tasaRtefte: r.rtefte.tasa,
    baseRtefte: r.rtefte.base,
    rtefte: r.rtefte.valor,
    tasaRteica: r.rteica.tasa,
    baseRteica: r.rteica.base,
    rteica: r.rteica.valor,
    tasaRteiva: r.rteiva.tasa,
    baseRteiva: r.rteiva.base,
    rteiva: r.rteiva.valor,
    tasaAutorretencion: r.autorretencion.tasa,
    autorretencion: r.autorretencion.valor,
    valorCartera: r.valorCartera,
    subtotalFactura: r.factura.subtotal,
    ivaFactura: r.factura.iva,
    totalFactura: r.factura.total,
    estado: 'calculado',
    usuarioRechazo: null,
    fechaRechazo: null,
    motivoRechazo: null,
    desglose: JSON.stringify({ ...r, ...desglose }),
  });
}

@Injectable()
export class PreLiquidadoService {
  constructor(
    @InjectRepository(PreLiquidado) private readonly preRepo: Repository<PreLiquidado>,
    @InjectRepository(Volumen) private readonly volRepo: Repository<Volumen>,
    @InjectRepository(ContratoItem) private readonly itemRepo: Repository<ContratoItem>,
    private readonly motor: MotorCalculoService,
    private readonly tarifas: TarifasService,
    private readonly parametros: ParametrosService,
    private readonly auditoria: AuditoriaService,
    private readonly trm: TrmService,
  ) {}

  async obtenerTasas(): Promise<TasasTributarias> {
    const vig = await this.parametros.findVigentes();
    const m = new Map(vig.map((p) => [p.clave, Number(p.valor)]));
    return {
      iva: m.get('IVA') ?? 0,
      rtefte: m.get('RTEFTE') ?? 0,
      rteica: m.get('RTEICA') ?? 0,
      rteiva: m.get('RTEIVA') ?? 0,
      autorretencion: m.get('AUTORRETENCION') ?? 0,
    };
  }

  /**
   * Corre el motor sobre todos los volúmenes del periodo que tienen tarifa
   * enlazada, y guarda cada monto con su desglose. Idempotente (recalcula).
   *
   * Un contrato_item puede agrupar varios servicios (producto+concepto) —
   * "hibrido": sus volumenes se SUMAN y esa suma es la que se compara contra
   * la tabla de tarifa unica del item, por eso se agrupa por contrato_item_id
   * ANTES de llamar al motor (que sigue recibiendo un solo `volumen`, sin
   * cambios). El aporte de cada servicio queda trazado en `desglose`.
   */
  async calcularPeriodo(dto: CalcularPeriodoDto): Promise<ResultadoCalcularPeriodo> {
    const { anio, mes } = dto;
    const tasas = await this.obtenerTasas();

    const volumenes = await this.volRepo.find({
      where: { anio, mes, contratoItemId: Not(IsNull()) },
      relations: { cliente: true },
    });

    const porItem = new Map<number, Volumen[]>();
    for (const vol of volumenes) {
      const lista = porItem.get(vol.contratoItemId!) ?? [];
      lista.push(vol);
      porItem.set(vol.contratoItemId!, lista);
    }

    const res: ResultadoCalcularPeriodo = { anio, mes, calculados: 0, bloqueados: 0, errores: [] };

    for (const [itemId, vols] of porItem) {
      const item = await this.itemRepo.findOne({ where: { id: itemId }, relations: { conceptos: true } });
      if (!item) continue;
      if (item.moneda === 'USD') {
        // Este cálculo no pasa a pesos con TRM: los cobros en USD se liquidan por Empalme.
        res.errores.push({ item: item.id, cliente: vols[0].cliente?.razonSocial ?? '', motivo: 'Tarifa en USD: liquídelo desde Empalme (convierte con TRM)' });
        continue;
      }

      const volumenTotal = vols.reduce((s, v) => s + v.cantidad, 0);
      const esHibrido = item.conceptos.length > 1;

      // Tarifa del año para este item
      const t = await this.tarifas.getByItem(item.id, anio);
      const tarifaEntrada = {
        escalones: t.escalones.map((e) => ({
          volumenDesde: e.volumenDesde,
          volumenHasta: e.volumenHasta,
          precioUnitario: e.precioUnitario,
        })),
        valorMinimo: t.minimos[0]?.valorMinimo ?? null,
        volumenTopeMinimo: t.minimos[0]?.volumenTope ?? null,
        valorFijo: t.tarifasFijas[0]?.valorFijo ?? null,
        // Suma en decimal exacto: en float, 1,0025 + 0,0025 puede quedar en 1,00499… y redondear mal.
        recargoFijo: t.recargos.reduce((s, r) => s.add(r.valor), new Decimal(0)).toNumber() || null,
      };

      try {
        const r = this.motor.calcular({
          modeloCobro: item.modeloCobro,
          volumen: volumenTotal,
          anioTarifa: anio,
          tarifa: tarifaEntrada,
          tasas,
        });

        const escalonEnt = r.escalonUsado
          ? t.escalones.find(
              (e) => e.volumenDesde === r.escalonUsado!.volumenDesde && e.volumenHasta === r.escalonUsado!.volumenHasta,
            )
          : undefined;

        const anomalias = volumenTotal === 0
          ? JSON.stringify([{ tipo: 'volumen_cero', mensaje: 'Volumen cero en el periodo — revisar.' }])
          : null;

        const existente = await this.preRepo.findOne({
          where: { contratoItemId: item.id, anio, mes },
        });
        if (existente && ESTADOS_CERRADOS.includes(existente.estado)) {
          res.bloqueados++;
          continue;
        }
        const base = existente ?? this.preRepo.create({ contratoItemId: item.id, anio, mes });

        const unico = !esHibrido ? item.conceptos[0] : undefined;

        Object.assign(base, {
          clienteId: vols[0].clienteId,
          productoId: unico?.productoId ?? null,
          conceptoId: unico?.conceptoId ?? null,
          escalonId: escalonEnt?.id ?? null,
          anomalias,
        });
        asignarResultado(base, r, {
          volumenesOrigen: vols.map((v) => ({
            productoId: v.productoId,
            conceptoId: v.conceptoId,
            cantidad: v.cantidad,
          })),
        });
        await this.preRepo.save(base);
        res.calculados++;
      } catch (e) {
        const motivo = e instanceof ErrorCalculo ? `${e.codigo}: ${e.message}` : 'error de cálculo';
        res.errores.push({ item: item.id, cliente: vols[0].cliente?.razonSocial ?? '', motivo });
      }
    }

    return res;
  }

  /** Último periodo con pre-liquidados: las pantallas abren ahí en vez de en un mes vacío. */
  async ultimoPeriodo(): Promise<{ anio: number; mes: number } | null> {
    const p = await this.preRepo.createQueryBuilder('p').select(['p.anio', 'p.mes']).orderBy('p.anio', 'DESC').addOrderBy('p.mes', 'DESC').getOne();
    return p ? { anio: p.anio, mes: p.mes } : null;
  }

  async findAll(query: ListPreliquidadosQueryDto): Promise<PaginatedResult<PreLiquidado>> {
    const { page, limit, anio, mes, estado, busqueda } = query;
    const qb = this.preRepo.createQueryBuilder('p').leftJoinAndSelect('p.cliente', 'cli');
    if (anio) qb.andWhere('p.anio = :anio', { anio });
    if (mes) qb.andWhere('p.mes = :mes', { mes });
    if (estado) qb.andWhere('p.estado = :estado', { estado });
    if (busqueda) qb.andWhere('(cli.nit LIKE :b OR cli.razon_social LIKE :b)', { b: `%${busqueda}%` });
    qb.orderBy('p.valorCartera', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return buildPaginated(data, total, page, limit);
  }

  async findOne(id: number): Promise<PreLiquidado> {
    const p = await this.preRepo.findOne({ where: { id }, relations: { cliente: true } });
    if (!p) throw new NotFoundException(`No existe el pre-liquidado ${id}`);
    return p;
  }

  /** Gate humano: aprobar un pre-liquidado calculado. */
  async aprobar(id: number, usuario: string): Promise<PreLiquidado> {
    const p = await this.findOne(id);
    if (p.estado !== 'calculado') {
      throw new BadRequestException(`Solo se puede aprobar un pre-liquidado en estado 'calculado' (está en '${p.estado}').`);
    }
    p.estado = 'aprobado';
    p.usuarioAprobo = usuario;
    p.fechaAprobacion = new Date();
    const guardado = await this.preRepo.save(p);
    await this.auditoria.registrar({
      tabla: 'pre_liquidados', registroId: id, usuario, accion: 'UPDATE',
      valorAnterior: { estado: 'calculado' }, valorNuevo: { estado: 'aprobado', totalFactura: p.totalFactura },
    });
    return guardado;
  }

  /**
   * La factura se emitió: el cobro aprobado pasa a 'facturado' con su fecha.
   * Cobro en USD: se fija con la TRM del DÍA DE LA FACTURA (regla de Contabilidad):
   * la oficial de esa fecha o la que digite Contabilidad (queda como TRM manual de
   * ese día, en auditoría). Pesos, IVA y retenciones se recalculan con el motor.
   */
  async facturar(id: number, dto: FacturarPreliquidadoDto, usuario: string): Promise<PreLiquidado> {
    const p = await this.findOne(id);
    if (p.estado !== 'aprobado') {
      throw new BadRequestException(`Solo se puede facturar un pre-liquidado aprobado (está en '${p.estado}').`);
    }
    const anterior = { estado: p.estado, totalFactura: p.totalFactura, trm: p.trm, fechaTrm: p.fechaTrm };

    if (p.moneda === 'USD') {
      const desglose = JSON.parse(p.desglose ?? '{}');
      const usd = desglose.usd?.resultado as ResultadoCalculo | undefined;
      if (!usd) throw new BadRequestException('El cobro en USD no tiene su cálculo en dólares: vuelva a liquidar el periodo.');
      const trm = dto.trm != null
        ? (await this.trm.registrarManual(dto.fechaFactura, dto.trm, usuario)).valor
        : (await this.trm.deFecha(dto.fechaFactura)).valor;
      const usuarioAprobo = p.usuarioAprobo;
      const fechaAprobacion = p.fechaAprobacion;
      asignarResultado(p, aPesos(usd, trm, undefined, this.motor), {
        volumenesOrigen: desglose.volumenesOrigen,
        contrato: desglose.contrato,
        servicios: desglose.servicios,
        usd: { resultado: usd, trm, fechaTrm: dto.fechaFactura },
      });
      Object.assign(p, { usuarioAprobo, fechaAprobacion, trm, fechaTrm: dto.fechaFactura, trmDefinitiva: true });
    }
    Object.assign(p, { estado: 'facturado', fechaFactura: dto.fechaFactura, usuarioFacturo: usuario });
    const guardado = await this.preRepo.save(p);
    await this.auditoria.registrar({
      tabla: 'pre_liquidados', registroId: id, usuario, accion: 'UPDATE',
      valorAnterior: anterior,
      valorNuevo: { estado: 'facturado', fechaFactura: dto.fechaFactura, totalFactura: p.totalFactura, trm: p.trm },
    });
    return guardado;
  }

  /**
   * Gate humano: rechazar un pre-liquidado calculado, con motivo obligatorio.
   * No se borra: queda como evidencia hasta la siguiente corrida del periodo,
   * que lo recalcula y lo devuelve a 'calculado' para nueva revisión.
   */
  async rechazar(id: number, usuario: string, motivo: string): Promise<PreLiquidado> {
    const p = await this.findOne(id);
    if (p.estado !== 'calculado') {
      throw new BadRequestException(`Solo se puede rechazar un pre-liquidado en estado 'calculado' (está en '${p.estado}').`);
    }
    p.estado = 'rechazado';
    p.usuarioRechazo = usuario;
    p.fechaRechazo = new Date();
    p.motivoRechazo = motivo.trim();
    const guardado = await this.preRepo.save(p);
    await this.auditoria.registrar({
      tabla: 'pre_liquidados', registroId: id, usuario, accion: 'UPDATE',
      valorAnterior: { estado: 'calculado' }, valorNuevo: { estado: 'rechazado', motivo: p.motivoRechazo },
    });
    return guardado;
  }
}
