import Decimal from 'decimal.js';
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import { Cliente } from '../clientes/entities/cliente.entity';
import { recalcularSegmentoCliente } from '../clientes/segmento';
import { Contrato } from '../contratos/entities/contrato.entity';
import { ContratoItem } from '../contratos/entities/contrato-item.entity';
import { ContratoItemConcepto } from '../contratos/entities/contrato-item-concepto.entity';
import { ConceptoFacturable } from '../productos/entities/concepto-facturable.entity';
import { Producto } from '../productos/entities/producto.entity';
import { TarifaEscalon } from '../tarifas/entities/tarifa-escalon.entity';
import { MinimoGarantizado } from '../tarifas/entities/minimo-garantizado.entity';
import { TarifaFija } from '../tarifas/entities/tarifa-fija.entity';
import { RecargoFijo } from '../tarifas/entities/recargo-fijo.entity';
import { PreLiquidado } from '../calculo/entities/pre-liquidado.entity';
import { asignarResultado, PreLiquidadoService } from '../calculo/pre-liquidado.service';
import { AuditoriaCambio } from '../auditoria/entities/auditoria-cambio.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EmpalmePendiente } from './entities/empalme-pendiente.entity';
import { ConsumoExpress } from '../express/entities/consumo-express.entity';
import { ContratoTarifario, ErrorTarifario, leerTarifarioCsv } from './tarifario-csv';
import { leerVolumenesCsv, OpcionesVolumen, servicioDeLlave, VolumenesPeriodo } from './volumenes-bigquery';
import { liquidarPeriodo } from './empalme';
import { contratosDesdeBd, planificarGuardado, TarifasDeItemAnio } from './empalme-db';
import { BigQueryVolumenesService } from './bigquery-volumenes.service';
import { TrmService } from '../parametros/trm.service';
import { aPesos } from '../calculo/moneda';
import { hoyColombia } from '../common/fechas';
import { VariacionesService } from '../variaciones/variaciones.service';

/** De dónde vinieron los volúmenes (queda en el resumen y en la auditoría). */
export type OrigenVolumenes = 'csv' | 'bigquery' | 'bigquery_programado';

export interface ResultadoImportacion {
  contratosCreados: number;
  contratosActualizados: number;
  clientesCreados: number;
  /** Contratos que esperan retenciones: el cliente sí queda creado para completarlas en su ficha. */
  esperandoRetenciones: number;
  /** Servicios que Data no mide: se cargaron al contrato, pero se cobran a mano. */
  serviciosNoMedidos: string[];
  errores: ErrorTarifario[];
}

export interface ResumenLiquidacion {
  periodo: string;
  origen: OrigenVolumenes;
  filasBigQuery: number;
  nits: number;
  transacciones: number;
  ajustesNegativos: VolumenesPeriodo['ajustesNegativos'];
  /** Hrs_Dev (iSoat) del periodo y si Contabilidad lo excluyó del cobro. */
  hrsDev: VolumenesPeriodo['hrsDev'];
  liquidados: number;
  transaccionesLiquidadas: number;
  totalFacturado: number;
  bloqueados: number;
  /** Aprobados/facturados cuyo recálculo da otro total: revisar a mano. */
  aprobadosConCambio: { preLiquidadoId: number; cliente: string; totalAprobado: number; totalNuevo: number }[];
  pendientes: Record<string, { registros: number; transacciones: number }>;
  itemsSinCodigoData: { contrato: string; itemId: number }[];
  /** Suscripciones Express con consumo registrado este mes (no se cobran por mes). */
  suscripcionesExpress: number;
}

const LOTE_IDS = 1000; // SQL Server admite ~2.100 parámetros por consulta

@Injectable()
export class EmpalmeService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Contrato) private readonly contratosRepo: Repository<Contrato>,
    @InjectRepository(ConceptoFacturable) private readonly conceptosRepo: Repository<ConceptoFacturable>,
    @InjectRepository(EmpalmePendiente) private readonly pendientesRepo: Repository<EmpalmePendiente>,
    private readonly preLiquidados: PreLiquidadoService,
    private readonly auditoria: AuditoriaService,
    private readonly bigquery: BigQueryVolumenesService,
    private readonly variaciones: VariacionesService,
    private readonly trm: TrmService,
  ) {}

  /** Una liquidación a la vez (botón, CSV y tarea programada comparten los pre-liquidados del periodo). */
  private enCurso: string | null = null;

  // ---------------------------------------------------------------------------
  // Importación del tarifario (CSV de Contabilidad)
  // ---------------------------------------------------------------------------

  /**
   * Carga el tarifario a la BD. Cada contrato es una transacción propia: un
   * contrato con error no impide cargar los demás, y queda en `errores` con su
   * fila. Re-importar es seguro: el contrato se identifica por `contrato_id`
   * (coe.contratos.codigo) y los precios de cada año del CSV reemplazan a los
   * de la BD para ese año.
   */
  async importarTarifario(texto: string, usuario: string): Promise<ResultadoImportacion> {
    const { contratos, errores } = leerTarifarioCsv(texto);
    const res: ResultadoImportacion = { contratosCreados: 0, contratosActualizados: 0, clientesCreados: 0, esperandoRetenciones: 0, serviciosNoMedidos: [], errores: [...errores] };

    const conceptos = await this.conceptosRepo.find({ where: { codigoData: Not(IsNull()) } });
    const porCodigoData = new Map(conceptos.map((c) => [c.codigoData!, c]));
    const noMedidos = new Set<string>();

    for (const c of contratos) {
      try {
        const r = await this.dataSource.transaction(async (m) => {
          const servicios = new Map(porCodigoData);
          for (const s of new Set(c.items.flatMap((i) => i.servicios))) {
            if (servicios.has(s)) continue;
            // "iDocumentos/XYZ": el servicio sí lo mide Data; un subservicio que no está en el catálogo es un error de digitación.
            if (porCodigoData.has(servicioDeLlave(s))) throw new Error(`subservicio desconocido "${s}": revise el nombre que trae Data (catálogo de Productos)`);
            servicios.set(s, await this.conceptoNoMedido(m, s));
          }
          return this.guardarContrato(m, c, servicios, usuario);
        });
        c.items.flatMap((i) => i.servicios).filter((s) => !porCodigoData.has(s)).forEach((s) => noMedidos.add(s));
        if (r.clienteNuevo) res.clientesCreados++;
        // El contrato se carga igual; la liquidación no lo cobra hasta que Contabilidad complete las retenciones en la ficha del cliente.
        if (r.sinRetenciones) res.esperandoRetenciones++;
        if (r.contratoNuevo) res.contratosCreados++;
        else res.contratosActualizados++;
      } catch (e) {
        res.errores.push({ fila: 0, contratoId: c.contratoId, mensaje: (e as Error).message });
      }
    }
    res.serviciosNoMedidos = [...noMedidos].sort();
    return res;
  }

  /**
   * Servicio del tarifario que Data no reporta (Circular 001, estampado, portal…):
   * queda en el catálogo bajo el producto NO_MEDIDO, sin `codigo_data`. El item se
   * carga con su tarifa para que Contabilidad lo vea y lo edite en la app, pero el
   * empalme no lo liquida (sale en `itemsSinCodigoData`): se cobra a mano.
   */
  private async conceptoNoMedido(m: EntityManager, nombre: string): Promise<ConceptoFacturable> {
    let producto = await m.findOne(Producto, { where: { codigo: 'NO_MEDIDO' } });
    producto ??= await m.save(Producto, m.create(Producto, { codigo: 'NO_MEDIDO', nombre: 'No medido por Data' }));
    const codigo = nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 50);
    const existente = await m.findOne(ConceptoFacturable, { where: { productoId: producto.id, codigo } });
    return existente ?? m.save(ConceptoFacturable, m.create(ConceptoFacturable, { productoId: producto.id, codigo, nombre: nombre.slice(0, 150), codigoData: null }));
  }

  private async guardarContrato(
    m: EntityManager,
    c: ContratoTarifario,
    porCodigoData: Map<string, ConceptoFacturable>,
    usuario: string,
  ): Promise<{ contratoNuevo: boolean; clienteNuevo: boolean; sinRetenciones?: boolean }> {
    // Cliente: se crea si no existe. Un retirado NO se reactiva por la puerta de atrás.
    let cliente = await m.findOne(Cliente, { where: { nit: c.nit } });
    const clienteNuevo = !cliente;
    if (cliente?.estado === 'retirado') {
      throw new Error(`el cliente ${c.nit} está retirado; reactívelo en Clientes antes de cargarle un contrato`);
    }
    cliente ??= m.create(Cliente, { nit: c.nit, razonSocial: c.razonSocial, estado: 'activo', segmento: c.segmento });
    // Retención vacía en el CSV = se deja la que ya tiene el cliente (editada en su ficha).
    cliente.tasaRtefte = c.perfil.rtefte ?? cliente.tasaRtefte ?? null;
    cliente.tasaRteiva = c.perfil.rteiva ?? cliente.tasaRteiva ?? null;
    // ReteICA: ningún cliente la practica (Contabilidad, 28-oct-2026): vacía = 0.
    cliente.tasaRteica = c.perfil.rteica ?? cliente.tasaRteica ?? 0;
    cliente = await m.save(Cliente, cliente);
    // Sin retenciones el contrato se carga igual: Contabilidad las completa en la ficha del cliente
    // y mientras tanto el empalme no lo liquida (no hay tasa por defecto que aplicar a ciegas).
    const sinRetenciones = cliente.tasaRtefte == null || cliente.tasaRteiva == null || cliente.tasaRteica == null;

    let contrato = await m.findOne(Contrato, { where: { codigo: c.contratoId }, relations: { items: { conceptos: true } } });
    const contratoNuevo = !contrato;
    if (contrato && contrato.clienteId !== cliente.id) {
      throw new Error(`el contrato ${c.contratoId} ya existe para otro cliente (id ${contrato.clienteId})`);
    }
    contrato = await m.save(
      Contrato,
      m.merge(Contrato, contrato ?? m.create(Contrato, { clienteId: cliente.id, nombreContrato: c.contratoId, codigo: c.contratoId }), {
        vigenciaDesde: c.vigenciaDesde,
        vigenciaHasta: c.vigenciaHasta,
        segmento: c.segmento,
        estado: 'activo',
      }),
    );
    await recalcularSegmentoCliente(m, cliente.id);

    // El item se reconoce por sus servicios y su moneda (COP y USD del mismo servicio son items distintos).
    const clave = (pares: { productoId: number; conceptoId: number }[], moneda: string) =>
      `${pares.map((p) => `${p.productoId}:${p.conceptoId}`).sort().join('|')}#${moneda}`;
    const existentes = contrato.items ?? [];
    const usados = new Set<number>();

    for (const item of c.items) {
      const pares = item.servicios.map((s) => {
        const con = porCodigoData.get(s)!;
        return { productoId: con.productoId, conceptoId: con.id };
      });
      let ent = existentes.find((e) => !usados.has(e.id) && clave(e.conceptos, e.moneda ?? 'COP') === clave(pares, item.moneda));
      if (ent) {
        ent.modeloCobro = item.modeloCobro;
        ent.estado = 'activo';
        ent = await m.save(ContratoItem, ent);
      } else {
        ent = await m.save(ContratoItem, m.create(ContratoItem, { contratoId: contrato.id, modeloCobro: item.modeloCobro, moneda: item.moneda, estado: 'activo' }));
        await m.save(ContratoItemConcepto, pares.map((p) => m.create(ContratoItemConcepto, { contratoItemId: ent!.id, ...p })));
      }
      usados.add(ent.id);

      for (const [anioTxt, t] of Object.entries(item.tarifasPorAnio)) {
        const anio = Number(anioTxt);
        const where = { contratoItemId: ent.id, anio };
        await m.delete(TarifaEscalon, where);
        await m.delete(MinimoGarantizado, where);
        await m.delete(TarifaFija, where);
        await m.delete(RecargoFijo, where);
        if (t.escalones?.length) {
          await m.save(TarifaEscalon, t.escalones.map((e) => m.create(TarifaEscalon, { ...where, ...e, ipcAplicado: null })));
        }
        if (t.valorMinimo != null) {
          await m.save(MinimoGarantizado, m.create(MinimoGarantizado, { ...where, valorMinimo: t.valorMinimo, volumenTope: t.volumenTopeMinimo ?? null }));
        }
        if (t.valorFijo != null) await m.save(TarifaFija, m.create(TarifaFija, { ...where, valorFijo: t.valorFijo }));
        if (t.recargoFijo) await m.save(RecargoFijo, m.create(RecargoFijo, { ...where, concepto: 'RECARGO', valor: t.recargoFijo }));
      }
    }

    // Items del contrato que ya no vienen en el CSV: baja lógica, no borrado.
    const retirados = existentes.filter((e) => !usados.has(e.id) && e.estado === 'activo');
    for (const e of retirados) await m.update(ContratoItem, e.id, { estado: 'inactivo' });

    await this.auditoria.registrar(
      {
        tabla: 'contratos',
        registroId: contrato.id,
        usuario,
        accion: contratoNuevo ? 'INSERT' : 'UPDATE',
        valorNuevo: {
          origen: 'importacion_tarifario',
          codigo: c.contratoId,
          nit: c.nit,
          items: c.items.map((i) => ({ servicios: i.servicios, modelo: i.modeloCobro, anios: Object.keys(i.tarifasPorAnio) })),
          itemsDadosDeBaja: retirados.map((e) => e.id),
        },
      },
      m.getRepository(AuditoriaCambio),
    );
    return { contratoNuevo, clienteNuevo, sinRetenciones };
  }

  // ---------------------------------------------------------------------------
  // Liquidación del periodo (volúmenes de Data → pre-liquidados)
  // ---------------------------------------------------------------------------

  async cargarContratos(anio: number): Promise<ReturnType<typeof contratosDesdeBd>> {
    const contratos = await this.contratosRepo.find({
      where: { estado: 'activo' },
      relations: { cliente: true, items: { conceptos: { concepto: true } } },
    });
    const itemIds = contratos.flatMap((c) => (c.items ?? []).map((i) => i.id));
    const tarifas = new Map<number, TarifasDeItemAnio>();
    for (const id of itemIds) tarifas.set(id, { escalones: [], minimo: null, valorFijo: null, recargo: 0 });

    for (let i = 0; i < itemIds.length; i += LOTE_IDS) {
      const where = { contratoItemId: In(itemIds.slice(i, i + LOTE_IDS)), anio };
      const [escalones, minimos, fijas, recargos] = await Promise.all([
        this.dataSource.getRepository(TarifaEscalon).find({ where, order: { volumenDesde: 'ASC' } }),
        this.dataSource.getRepository(MinimoGarantizado).find({ where }),
        this.dataSource.getRepository(TarifaFija).find({ where }),
        this.dataSource.getRepository(RecargoFijo).find({ where }),
      ]);
      for (const e of escalones) tarifas.get(e.contratoItemId)!.escalones.push(e);
      for (const mn of minimos) tarifas.get(mn.contratoItemId)!.minimo = mn;
      for (const f of fijas) tarifas.get(f.contratoItemId)!.valorFijo = f.valorFijo;
      for (const r of recargos) {
        const t = tarifas.get(r.contratoItemId)!;
        t.recargo = new Decimal(t.recargo).add(r.valor).toNumber(); // decimal exacto, no float
      }
    }
    return contratosDesdeBd(contratos, tarifas, anio);
  }

  /** Liquidar con el CSV exportado de BigQuery (respaldo si la consulta directa no está disponible). */
  liquidarCsv(periodo: string, textoBigQuery: string, usuario: string, opciones: OpcionesVolumen = {}): Promise<ResumenLiquidacion> {
    return this.exclusivo(periodo, async () => this.liquidar(leerVolumenesCsv(textoBigQuery, periodo, opciones), usuario, 'csv'));
  }

  /** Liquidar consultando BigQuery directamente. */
  liquidarBigQuery(periodo: string, usuario: string, origen: OrigenVolumenes = 'bigquery', opciones: OpcionesVolumen = {}): Promise<ResumenLiquidacion> {
    return this.exclusivo(periodo, async () => this.liquidar(await this.bigquery.volumenes(periodo, opciones), usuario, origen));
  }

  estadoBigQuery() {
    return this.bigquery.estado();
  }

  private async exclusivo<T>(periodo: string, fn: () => Promise<T>): Promise<T> {
    if (this.enCurso) throw new ConflictException(`Ya hay una liquidación en curso (${this.enCurso}). Espere a que termine.`);
    this.enCurso = periodo;
    try {
      return await fn();
    } finally {
      this.enCurso = null;
    }
  }

  /**
   * Corre el empalme del periodo y guarda el resultado: pre-liquidados
   * (respetando aprobados/facturados) y la lista de lo que no empalmó.
   * Recalcular el mismo periodo es seguro.
   */
  private async liquidar(volumenes: VolumenesPeriodo, usuario: string, origen: OrigenVolumenes): Promise<ResumenLiquidacion> {
    const { periodo } = volumenes;
    const [anio, mes] = periodo.split('-').map(Number);
    const tasas = await this.preLiquidados.obtenerTasas();
    const { contratos, sinCodigoData } = await this.cargarContratos(anio);
    const r = liquidarPeriodo(contratos, volumenes, tasas);

    // Tarifas en USD: a pesos con la TRM de hoy como ESTIMADO; se fija al facturar con la del día de la factura.
    if (r.liquidaciones.some((l) => l.moneda === 'USD')) {
      const trm = await this.trm.estimada(hoyColombia());
      r.liquidaciones = r.liquidaciones.flatMap((l) => {
        if (l.moneda !== 'USD') return [l];
        if (!trm) {
          r.errores.push({
            nit: l.nit, contratoId: l.contratoId, servicios: l.servicios, volumen: l.resultado.volumen,
            motivo: 'SIN_TRM: no se pudo obtener la TRM para pasar el cobro en USD a pesos; digítela en Parámetros › TRM',
          });
          return [];
        }
        return [{ ...l, usd: { resultado: l.resultado, trm: trm.valor, fechaTrm: trm.fecha }, resultado: aPesos(l.resultado, trm.valor) }];
      });
    }

    const resumen: ResumenLiquidacion = {
      periodo,
      origen,
      filasBigQuery: volumenes.filas,
      nits: volumenes.porNit.size,
      transacciones: [...volumenes.porNit.values()].flatMap((s) => [...s.values()]).reduce((a, b) => a + b, 0),
      ajustesNegativos: volumenes.ajustesNegativos,
      hrsDev: volumenes.hrsDev,
      liquidados: 0,
      transaccionesLiquidadas: 0,
      totalFacturado: 0,
      bloqueados: 0,
      aprobadosConCambio: [],
      pendientes: {},
      itemsSinCodigoData: sinCodigoData,
      suscripcionesExpress: 0,
    };

    await this.dataSource.transaction(async (m) => {
      await this.variaciones.guardarPeriodo(m, periodo, volumenes.diario, origen);
      const existentes = await m.find(PreLiquidado, { where: { anio, mes } });
      const plan = planificarGuardado(existentes, r.liquidaciones);

      for (const { liquidacion: l, existente } of plan.escribir) {
        const p = existente ?? m.create(PreLiquidado, { contratoItemId: l.itemId!, anio, mes });
        Object.assign(p, {
          clienteId: l.clienteId!,
          productoId: null,
          conceptoId: null,
          escalonId: null,
          anomalias: l.anomalias.length ? JSON.stringify(l.anomalias.map((tipo) => ({ tipo }))) : null,
        });
        asignarResultado(p, l.resultado, { volumenesOrigen: l.volumenesOrigen, contrato: l.contratoId, servicios: l.servicios, usd: l.usd });
        Object.assign(p, {
          moneda: l.moneda,
          subtotalMoneda: l.usd?.resultado.subtotal ?? null,
          trm: l.usd?.trm ?? null,
          fechaTrm: l.usd?.fechaTrm ?? null,
          trmDefinitiva: false,
          fechaFactura: null,
          usuarioFacturo: null,
        });
        await m.save(PreLiquidado, p);
        resumen.liquidados++;
        resumen.transaccionesLiquidadas += l.resultado.volumen;
        resumen.totalFacturado += l.resultado.factura.total;
      }
      for (const b of plan.bloqueados) {
        resumen.bloqueados++;
        if (b.cambio) {
          const nuevo = r.liquidaciones.find((l) => l.itemId === b.existente.contratoItemId)!;
          resumen.aprobadosConCambio.push({
            preLiquidadoId: b.existente.id,
            cliente: nuevo.razonSocial,
            totalAprobado: Number(b.existente.totalFactura),
            totalNuevo: nuevo.resultado.factura.total,
          });
        }
      }
      if (plan.borrar.length) await m.remove(PreLiquidado, plan.borrar);

      // Consumo del mes de las suscripciones Express: referencia frente al tope, se reemplaza en cada corrida.
      const consumos = r.consumosPlan.filter((c) => c.itemId != null);
      if (consumos.length) {
        const ids = consumos.map((c) => c.itemId!);
        for (let i = 0; i < ids.length; i += 1000) {
          await m.delete(ConsumoExpress, { anio, mes, contratoItemId: In(ids.slice(i, i + 1000)) });
        }
        for (let i = 0; i < consumos.length; i += 200) {
          await m.save(ConsumoExpress, consumos.slice(i, i + 200).map((c) =>
            m.create(ConsumoExpress, { contratoItemId: c.itemId!, anio, mes, cantidad: c.cantidad })));
        }
      }
      resumen.suscripcionesExpress = consumos.length;

      await m.delete(EmpalmePendiente, { anio, mes });
      const pendientes = [
        ...r.noEmpalmados.map((n) => ({ nit: n.nit, servicio: n.servicio, cantidad: n.cantidad, motivo: n.motivo, detalle: null })),
        ...r.errores.map((e) => ({
          nit: e.nit,
          servicio: e.servicios.join('+'),
          cantidad: e.volumen,
          motivo: 'ERROR_CALCULO' as const,
          detalle: `${e.contratoId}: ${e.motivo}`.slice(0, 500),
        })),
      ];
      for (let i = 0; i < pendientes.length; i += 200) {
        await m.save(EmpalmePendiente, pendientes.slice(i, i + 200).map((p) => m.create(EmpalmePendiente, { anio, mes, ...p })));
      }
      for (const p of pendientes) {
        const acc = (resumen.pendientes[p.motivo] ??= { registros: 0, transacciones: 0 });
        acc.registros++;
        acc.transacciones += p.cantidad;
      }

      await this.auditoria.registrar(
        {
          tabla: 'pre_liquidados',
          registroId: anio * 100 + mes,
          usuario,
          accion: 'INSERT',
          valorNuevo: { origen: `empalme_${origen}`, periodo, liquidados: resumen.liquidados, bloqueados: resumen.bloqueados, pendientes: resumen.pendientes, hrsDev: resumen.hrsDev },
        },
        m.getRepository(AuditoriaCambio),
      );
    });

    resumen.totalFacturado = Math.round(resumen.totalFacturado);
    return resumen;
  }

  async pendientes(anio: number, mes: number): Promise<EmpalmePendiente[]> {
    return this.pendientesRepo.find({ where: { anio, mes }, order: { cantidad: 'DESC' } });
  }
}
