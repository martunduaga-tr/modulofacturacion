import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Cliente } from '../clientes/entities/cliente.entity';
import { recalcularSegmentoCliente } from '../clientes/segmento';
import { Contrato } from '../contratos/entities/contrato.entity';
import { ContratoItem } from '../contratos/entities/contrato-item.entity';
import { ContratoItemConcepto } from '../contratos/entities/contrato-item-concepto.entity';
import { ConceptoFacturable } from '../productos/entities/concepto-facturable.entity';
import { MinimoGarantizado } from '../tarifas/entities/minimo-garantizado.entity';
import { AuditoriaCambio } from '../auditoria/entities/auditoria-cambio.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PreLiquidadoService } from '../calculo/pre-liquidado.service';
import { SolicitudExpress } from './entities/solicitud-express.entity';
import { CobroExpress } from './entities/cobro-express.entity';
import { ConsumoExpress } from './entities/consumo-express.entity';
import { SolicitudExpressDto } from './dto/solicitud-express.dto';
import {
  cobrosDeSolicitud,
  consumoDelCiclo,
  DatosSolicitud,
  diasParaVencer,
  EstadoSolicitud,
  validarSolicitud,
  vigenciaHastaPorDefecto,
} from './express-reglas';

export interface ArchivoPdf {
  buffer: Buffer;
  originalname: string;
  size: number;
}

export interface SuscripcionExpress {
  contratoId: number;
  codigo: string | null;
  clienteId: number;
  nit: string;
  razonSocial: string;
  servicio: string;
  tope: number | null;
  valorAnual: number | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  diasParaVencer: number | null;
  consumoCiclo: number;
  solicitudPendiente: { id: number; tipo: string; estado: EstadoSolicitud } | null;
}

const MAX_PDF = 10 * 1024 * 1024;
const PENDIENTES: EstadoSolicitud[] = ['enviada', 'correccion'];

function validarPdf(archivo: ArchivoPdf | undefined): void {
  if (!archivo) return;
  if (archivo.size > MAX_PDF) throw new BadRequestException('El PDF supera 10 MB.');
  if (archivo.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new BadRequestException('El soporte debe ser un archivo PDF.');
  }
}

@Injectable()
export class ExpressService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(SolicitudExpress) private readonly solicitudes: Repository<SolicitudExpress>,
    @InjectRepository(CobroExpress) private readonly cobros: Repository<CobroExpress>,
    @InjectRepository(Contrato) private readonly contratos: Repository<Contrato>,
    @InjectRepository(ConceptoFacturable) private readonly conceptos: Repository<ConceptoFacturable>,
    private readonly preLiquidados: PreLiquidadoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ---------------------------------------------------------------------------
  // Suscripciones
  // ---------------------------------------------------------------------------

  /** Suscripciones Express activas con su plan vigente, días para vencer y consumo del ciclo. */
  async suscripciones(hoy = new Date()): Promise<SuscripcionExpress[]> {
    const contratos = await this.contratos
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.cliente', 'cli')
      .innerJoinAndSelect('c.items', 'it', "it.modelo_cobro = 'plan_anual' AND it.estado = 'activo'")
      .leftJoinAndSelect('it.conceptos', 'cc')
      .leftJoinAndSelect('cc.concepto', 'con')
      .where("c.estado = 'activo'")
      .orderBy('cli.razonSocial', 'ASC')
      .getMany();
    const itemIds = contratos.flatMap((c) => c.items.map((i) => i.id));
    const [planes, consumos, pendientes] = await Promise.all([
      itemIds.length ? this.dataSource.getRepository(MinimoGarantizado).find({ where: { contratoItemId: In(itemIds) } }) : ([] as MinimoGarantizado[]),
      itemIds.length ? this.dataSource.getRepository(ConsumoExpress).find({ where: { contratoItemId: In(itemIds) } }) : ([] as ConsumoExpress[]),
      this.solicitudes.find({ where: { estado: In(PENDIENTES) } }),
    ]);

    return contratos.map((c) => {
      const item = c.items[0];
      const anioCiclo = Number((c.vigenciaDesde ?? hoy.toISOString()).slice(0, 4));
      // Plan del año en que inicia el ciclo (o el último anterior).
      const plan = planes
        .filter((p) => p.contratoItemId === item.id && p.anio <= anioCiclo)
        .sort((a, b) => b.anio - a.anio)[0];
      const pendiente = pendientes.find((s) => s.contratoId === c.id);
      return {
        contratoId: c.id,
        codigo: c.codigo,
        clienteId: c.cliente.id,
        nit: c.cliente.nit,
        razonSocial: c.cliente.razonSocial,
        servicio: item.conceptos[0]?.concepto?.codigoData ?? '',
        tope: plan?.volumenTope ?? null,
        valorAnual: plan?.valorMinimo ?? null,
        vigenciaDesde: c.vigenciaDesde,
        vigenciaHasta: c.vigenciaHasta,
        diasParaVencer: diasParaVencer(c.vigenciaHasta, hoy),
        consumoCiclo: consumoDelCiclo(consumos.filter((x) => x.contratoItemId === item.id), c.vigenciaDesde),
        solicitudPendiente: pendiente ? { id: pendiente.id, tipo: pendiente.tipo, estado: pendiente.estado } : null,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Solicitudes de Comercial
  // ---------------------------------------------------------------------------

  async crear(dto: SolicitudExpressDto, archivo: ArchivoPdf | undefined, usuario: string): Promise<SolicitudExpress> {
    validarPdf(archivo);
    const datos = await this.completarYValidar(dto, !!archivo);

    const pendiente = await this.solicitudes.findOne({
      where: dto.tipo === 'NUEVO'
        ? { nit: datos.nit!, servicio: datos.servicio!, estado: In(PENDIENTES) }
        : { contratoId: datos.contratoId!, estado: In(PENDIENTES) },
    });
    if (pendiente) throw new ConflictException(`Ya hay una solicitud en curso para esta suscripción (#${pendiente.id}).`);

    const s = this.solicitudes.create({
      ...this.campos(datos),
      tipo: dto.tipo,
      estado: 'enviada',
      observaciones: dto.observaciones ?? null,
      adjuntoNombre: archivo?.originalname ?? null,
      adjuntoContenido: archivo?.buffer ?? null,
      usuarioCreo: usuario,
    });
    const guardada = await this.solicitudes.save(s);
    await this.auditar(guardada.id, usuario, 'INSERT', null, { tipo: s.tipo, estado: 'enviada', nit: s.nit, servicio: s.servicio });
    return this.obtener(guardada.id);
  }

  /** Comercial corrige una solicitud devuelta por Contabilidad y la reenvía. */
  async corregir(id: number, dto: SolicitudExpressDto, archivo: ArchivoPdf | undefined, usuario: string): Promise<SolicitudExpress> {
    const s = await this.obtener(id);
    if (s.estado !== 'correccion') throw new BadRequestException(`Solo se corrige una solicitud devuelta (está '${s.estado}').`);
    if (dto.tipo !== s.tipo) throw new BadRequestException('No se puede cambiar el tipo de la solicitud; cree una nueva.');
    validarPdf(archivo);
    const datos = await this.completarYValidar({ ...dto, contratoId: s.contratoId ?? undefined }, !!archivo || !!s.adjuntoNombre);

    Object.assign(s, this.campos(datos), {
      estado: 'enviada' as EstadoSolicitud,
      observaciones: dto.observaciones ?? s.observaciones,
      usuarioModifico: usuario,
      fechaModificacion: new Date(),
    });
    if (archivo) Object.assign(s, { adjuntoNombre: archivo.originalname, adjuntoContenido: archivo.buffer });
    await this.solicitudes.save(s);
    await this.auditar(id, usuario, 'UPDATE', { estado: 'correccion' }, { estado: 'enviada', correccion: true });
    return this.obtener(id);
  }

  /**
   * Contabilidad aprueba: aplica la solicitud al contrato y genera el/los
   * cobro(s). Todo en una transacción. Quien creó la solicitud no puede
   * aprobarla (separación de funciones).
   */
  async aprobar(id: number, usuario: string): Promise<SolicitudExpress> {
    const s = await this.obtener(id);
    if (s.estado !== 'enviada') throw new BadRequestException(`Solo se aprueba una solicitud enviada (está '${s.estado}').`);
    if (s.usuarioCreo === usuario) throw new ForbiddenException('Quien crea la solicitud no puede aprobarla.');

    await this.dataSource.transaction(async (m) => {
      const { contrato, cliente } = await this.aplicar(m, s);

      const global = await this.preLiquidados.obtenerTasas();
      const tasas = {
        ...global,
        rtefte: cliente.tasaRtefte ?? global.rtefte,
        rteiva: cliente.tasaRteiva ?? global.rteiva,
        rteica: cliente.tasaRteica ?? global.rteica,
      };
      for (const c of cobrosDeSolicitud(s, tasas)) {
        const r = c.resultado;
        await m.save(CobroExpress, m.create(CobroExpress, {
          solicitudId: s.id,
          clienteId: cliente.id,
          contratoId: contrato.id,
          concepto: c.concepto,
          descripcion: c.descripcion,
          cantidad: c.cantidad,
          valorUnitario: c.valorUnitario,
          subtotal: r.factura.subtotal,
          iva: r.factura.iva,
          total: r.factura.total,
          rtefte: r.rtefte.valor,
          rteiva: r.rteiva.valor,
          rteica: r.rteica.valor,
          desglose: JSON.stringify(r),
          estado: 'por_facturar',
        }));
      }

      await m.update(SolicitudExpress, s.id, {
        estado: 'aprobada', usuarioReviso: usuario, fechaRevision: new Date(), contratoId: contrato.id,
      });
      await this.auditar(s.id, usuario, 'UPDATE', { estado: 'enviada' }, { estado: 'aprobada', contratoId: contrato.id }, m);
    });
    return this.obtener(id);
  }

  async pedirCorreccion(id: number, comentario: string, usuario: string): Promise<SolicitudExpress> {
    return this.revisar(id, 'correccion', ['enviada'], comentario, usuario);
  }

  async rechazar(id: number, comentario: string, usuario: string): Promise<SolicitudExpress> {
    return this.revisar(id, 'rechazada', ['enviada', 'correccion'], comentario, usuario);
  }

  async listar(estado?: string): Promise<SolicitudExpress[]> {
    return this.solicitudes.find({ where: estado ? { estado: estado as EstadoSolicitud } : {}, order: { fechaCreacion: 'DESC' } });
  }

  async obtener(id: number): Promise<SolicitudExpress> {
    const s = await this.solicitudes.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`No existe la solicitud ${id}`);
    return s;
  }

  async adjunto(id: number): Promise<{ nombre: string; contenido: Buffer }> {
    const s = await this.solicitudes.findOne({ where: { id }, select: { id: true, adjuntoNombre: true, adjuntoContenido: true } });
    if (!s?.adjuntoContenido) throw new NotFoundException('La solicitud no tiene PDF adjunto.');
    return { nombre: s.adjuntoNombre ?? `soporte-${id}.pdf`, contenido: s.adjuntoContenido };
  }

  async listarCobros(estado?: string): Promise<CobroExpress[]> {
    return this.cobros.find({
      where: estado ? { estado: estado as CobroExpress['estado'] } : {},
      relations: { cliente: true },
      order: { fechaCreacion: 'DESC' },
    });
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  /** Completa los datos según el tipo (de la suscripción existente) y valida; lanza 400 con todos los errores. */
  private async completarYValidar(dto: SolicitudExpressDto, tieneAdjunto: boolean): Promise<DatosSolicitud> {
    const datos: DatosSolicitud = { ...dto, noRenueva: !!dto.noRenueva, tieneAdjunto };

    if (dto.tipo === 'NUEVO') {
      if (dto.servicio && !(await this.conceptos.findOne({ where: { codigoData: dto.servicio } }))) {
        throw new BadRequestException(`El servicio "${dto.servicio}" no existe en el catálogo.`);
      }
      const yaExiste = dto.nit && dto.servicio
        ? await this.contratos.findOne({ where: { codigo: `${dto.nit}-EXP-${await this.codigoConcepto(dto.servicio)}`, estado: 'activo' } })
        : null;
      if (yaExiste) throw new ConflictException('El cliente ya tiene esta suscripción activa: use una renovación.');
    } else if (dto.contratoId) {
      const c = await this.contratos.findOne({
        where: { id: dto.contratoId },
        relations: { cliente: true, items: { conceptos: { concepto: true } } },
      });
      const item = c?.items.find((i) => i.modeloCobro === 'plan_anual' && i.estado === 'activo');
      if (!c || c.estado !== 'activo' || !item) throw new BadRequestException('La suscripción no existe o no es una suscripción Express activa.');
      Object.assign(datos, {
        nit: c.cliente.nit,
        razonSocial: c.cliente.razonSocial,
        servicio: item.conceptos[0]?.concepto?.codigoData ?? '',
      });
      // Renovación: por defecto el nuevo ciclo arranca el día siguiente al fin del actual.
      if (dto.tipo === 'RENOVACION' && !dto.vigenciaDesde && c.vigenciaHasta) {
        const d = new Date(`${c.vigenciaHasta}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        datos.vigenciaDesde = d.toISOString().slice(0, 10);
      }
    }
    if (dto.tipo !== 'COBRO_ADICIONAL' && datos.vigenciaDesde && !datos.vigenciaHasta) {
      datos.vigenciaHasta = vigenciaHastaPorDefecto(datos.vigenciaDesde);
    }

    const errores = validarSolicitud(datos);
    if (errores.length) throw new BadRequestException(errores);
    return datos;
  }

  private campos(d: DatosSolicitud): Partial<SolicitudExpress> {
    return {
      contratoId: d.contratoId ?? null,
      nit: d.nit!,
      razonSocial: d.razonSocial!,
      servicio: d.servicio!,
      tope: d.tope ?? null,
      valorAnual: d.valorAnual ?? null,
      vigenciaDesde: d.vigenciaDesde ?? null,
      vigenciaHasta: d.vigenciaHasta ?? null,
      tasaRtefte: d.tasaRtefte ?? null,
      tasaRteiva: d.tasaRteiva ?? null,
      tasaRteica: d.tasaRteica ?? null,
      cantidadAdicional: d.cantidadAdicional ?? null,
      precioAdicional: d.precioAdicional ?? null,
      noRenueva: !!d.noRenueva,
    };
  }

  private async codigoConcepto(codigoData: string): Promise<string> {
    const c = await this.conceptos.findOne({ where: { codigoData } });
    return c?.codigo ?? codigoData;
  }

  /** Efecto de la solicitud aprobada sobre cliente/contrato/plan. */
  private async aplicar(m: EntityManager, s: SolicitudExpress): Promise<{ contrato: Contrato; cliente: Cliente }> {
    if (s.tipo === 'NUEVO') {
      const concepto = await m.findOne(ConceptoFacturable, { where: { codigoData: s.servicio } });
      if (!concepto) throw new BadRequestException(`El servicio "${s.servicio}" no existe en el catálogo.`);

      let cliente = await m.findOne(Cliente, { where: { nit: s.nit } });
      if (cliente?.estado === 'retirado') throw new BadRequestException(`El cliente ${s.nit} está retirado: reactívelo antes de aprobar.`);
      if (!cliente) {
        cliente = m.create(Cliente, {
          nit: s.nit, razonSocial: s.razonSocial, estado: 'activo', segmento: 'EXPRESS',
          tasaRtefte: s.tasaRtefte, tasaRteiva: s.tasaRteiva, tasaRteica: s.tasaRteica,
        });
      } else {
        // Cliente existente: sus retenciones mandan; solo se completan las que falten.
        cliente.tasaRtefte ??= s.tasaRtefte;
        cliente.tasaRteiva ??= s.tasaRteiva;
        cliente.tasaRteica ??= s.tasaRteica;
      }
      cliente = await m.save(Cliente, cliente);

      const codigo = `${s.nit}-EXP-${concepto.codigo}`;
      let contrato = await m.findOne(Contrato, { where: { codigo } });
      if (contrato?.estado === 'activo') throw new ConflictException(`La suscripción ${codigo} ya está activa.`);
      contrato = await m.save(Contrato, m.merge(Contrato, contrato ?? m.create(Contrato, { clienteId: cliente.id, nombreContrato: codigo, codigo }), {
        vigenciaDesde: s.vigenciaDesde, vigenciaHasta: s.vigenciaHasta, segmento: 'EXPRESS', estado: 'activo',
      }));
      await recalcularSegmentoCliente(m, cliente.id);
      const item = await m.save(ContratoItem, m.create(ContratoItem, { contratoId: contrato.id, modeloCobro: 'plan_anual', estado: 'activo' }));
      await m.save(ContratoItemConcepto, m.create(ContratoItemConcepto, { contratoItemId: item.id, productoId: concepto.productoId, conceptoId: concepto.id }));
      await this.guardarPlan(m, item.id, s);
      return { contrato, cliente };
    }

    const contrato = await m.findOne(Contrato, { where: { id: s.contratoId! }, relations: { cliente: true, items: true } });
    if (!contrato || contrato.estado !== 'activo') throw new BadRequestException('La suscripción ya no está activa.');

    if (s.tipo === 'RENOVACION') {
      const item = contrato.items.find((i) => i.modeloCobro === 'plan_anual' && i.estado === 'activo');
      if (!item) throw new BadRequestException('La suscripción no tiene plan anual activo.');
      await m.update(Contrato, contrato.id, { vigenciaDesde: s.vigenciaDesde, vigenciaHasta: s.vigenciaHasta });
      await this.guardarPlan(m, item.id, s);
    } else if (s.noRenueva) {
      await m.update(Contrato, contrato.id, { estado: 'inactivo' });
      await recalcularSegmentoCliente(m, contrato.clienteId);
    }
    return { contrato, cliente: contrato.cliente };
  }

  /** Plan del ciclo: valor anual y tope en minimo_garantizado del año en que inicia el ciclo. */
  private async guardarPlan(m: EntityManager, itemId: number, s: SolicitudExpress): Promise<void> {
    const anio = Number(s.vigenciaDesde!.slice(0, 4));
    await m.delete(MinimoGarantizado, { contratoItemId: itemId, anio });
    await m.save(MinimoGarantizado, m.create(MinimoGarantizado, {
      contratoItemId: itemId, anio, valorMinimo: s.valorAnual!, volumenTope: s.tope!,
    }));
  }

  private async revisar(
    id: number,
    nuevo: EstadoSolicitud,
    desde: EstadoSolicitud[],
    comentario: string,
    usuario: string,
  ): Promise<SolicitudExpress> {
    const s = await this.obtener(id);
    if (!desde.includes(s.estado)) throw new BadRequestException(`La solicitud está '${s.estado}': no se puede pasar a '${nuevo}'.`);
    if (s.usuarioCreo === usuario) throw new ForbiddenException('Quien crea la solicitud no puede revisarla.');
    await this.solicitudes.update(id, {
      estado: nuevo, usuarioReviso: usuario, fechaRevision: new Date(), comentarioRevision: comentario.trim(),
    });
    await this.auditar(id, usuario, 'UPDATE', { estado: s.estado }, { estado: nuevo, comentario: comentario.trim() });
    return this.obtener(id);
  }

  private auditar(id: number, usuario: string, accion: 'INSERT' | 'UPDATE', anterior: unknown, nuevo: unknown, m?: EntityManager) {
    return this.auditoria.registrar(
      { tabla: 'express_solicitudes', registroId: id, usuario, accion, valorAnterior: anterior ?? undefined, valorNuevo: nuevo },
      m?.getRepository(AuditoriaCambio),
    );
  }
}
