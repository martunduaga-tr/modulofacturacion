import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Contrato } from './entities/contrato.entity';
import { ContratoItem } from './entities/contrato-item.entity';
import { ContratoItemConcepto } from './entities/contrato-item-concepto.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Producto } from '../productos/entities/producto.entity';
import { ConceptoFacturable } from '../productos/entities/concepto-facturable.entity';
import { AuditoriaCambio } from '../auditoria/entities/auditoria-cambio.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TarifasService } from '../tarifas/tarifas.service';
import { TarifasValidationService } from '../tarifas/tarifas-validation.service';
import { CreateContratoDto } from './dto/create-contrato.dto';
import { CreateContratoItemDto } from './dto/create-contrato-item.dto';
import { UpdateContratoDto } from './dto/update-contrato.dto';
import { ListContratosQueryDto } from './dto/list-contratos-query.dto';
import { buildPaginated, PaginatedResult } from '../common/dto/paginated-result';

@Injectable()
export class ContratosService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Contrato)
    private readonly contratosRepo: Repository<Contrato>,
    @InjectRepository(Cliente)
    private readonly clientesRepo: Repository<Cliente>,
    @InjectRepository(Producto)
    private readonly productosRepo: Repository<Producto>,
    @InjectRepository(ConceptoFacturable)
    private readonly conceptosRepo: Repository<ConceptoFacturable>,
    @InjectRepository(ContratoItemConcepto)
    private readonly itemConceptosRepo: Repository<ContratoItemConcepto>,
    private readonly tarifasService: TarifasService,
    private readonly tarifasValidation: TarifasValidationService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async findAll(query: ListContratosQueryDto): Promise<PaginatedResult<Contrato>> {
    const { page, limit, busqueda, productoId, modeloCobro, estado } = query;
    const qb = this.contratosRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cliente', 'cli');

    if (estado) {
      qb.andWhere('c.estado = :estado', { estado });
    }
    if (busqueda) {
      qb.andWhere('(cli.nit LIKE :b OR cli.razon_social LIKE :b OR c.nombre_contrato LIKE :b)', {
        b: `%${busqueda}%`,
      });
    }
    // Filtros sobre los items: EXISTS evita duplicar filas de contrato.
    if (productoId) {
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM coe.contrato_items it
           JOIN coe.contrato_item_conceptos cic ON cic.contrato_item_id = it.id
           WHERE it.contrato_id = c.id AND cic.producto_id = :productoId
         )`,
        { productoId },
      );
    }
    if (modeloCobro) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM coe.contrato_items it WHERE it.contrato_id = c.id AND it.modelo_cobro = :modeloCobro)',
        { modeloCobro },
      );
    }

    // orderBy DEBE usar la propiedad de la entidad (no la columna SQL): con el
    // JOIN + paginación TypeORM arma un DISTINCT y necesita la metadata.
    qb.orderBy('c.fechaCreacion', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return buildPaginated(data, total, page, limit);
  }

  /** Ficha completa: contrato + cliente + items con producto/concepto y sus tarifas. */
  async findOne(id: number): Promise<Contrato> {
    const contrato = await this.contratosRepo.findOne({
      where: { id },
      relations: {
        cliente: true,
        items: {
          conceptos: { producto: true, concepto: true },
          escalones: true,
          minimos: true,
          tarifasFijas: true,
        },
      },
    });
    if (!contrato) {
      throw new NotFoundException(`No existe el contrato con id ${id}`);
    }
    return contrato;
  }

  async create(dto: CreateContratoDto, usuario: string): Promise<Contrato> {
    await this.validarCreacion(dto);

    let contratoId = 0;
    await this.dataSource.transaction(async (manager) => {
      const contrato = manager.getRepository(Contrato).create({
        clienteId: dto.clienteId,
        nombreContrato: dto.nombreContrato,
        vigenciaDesde: dto.vigenciaDesde ?? null,
        vigenciaHasta: dto.vigenciaHasta ?? null,
        estado: dto.estado ?? 'activo',
        observaciones: dto.observaciones ?? null,
      });
      const guardado = await manager.getRepository(Contrato).save(contrato);
      contratoId = guardado.id;

      for (const itemDto of dto.items) {
        const item = manager.getRepository(ContratoItem).create({
          contratoId: guardado.id,
          modeloCobro: itemDto.modeloCobro,
        });
        const itemGuardado = await manager.getRepository(ContratoItem).save(item);
        for (const c of itemDto.conceptos) {
          await manager.getRepository(ContratoItemConcepto).save(
            manager.getRepository(ContratoItemConcepto).create({
              contratoItemId: itemGuardado.id,
              productoId: c.productoId,
              conceptoId: c.conceptoId,
            }),
          );
        }
        for (const tarifaAnio of itemDto.tarifas) {
          await this.tarifasService.persistirTarifaAnio(manager, itemGuardado.id, tarifaAnio);
        }
      }

      await this.auditoria.registrar(
        {
          tabla: 'contratos',
          registroId: guardado.id,
          usuario,
          accion: 'INSERT',
          valorNuevo: {
            clienteId: dto.clienteId,
            nombreContrato: dto.nombreContrato,
            items: dto.items.length,
          },
        },
        manager.getRepository(AuditoriaCambio),
      );
    });

    return this.findOne(contratoId);
  }

  async update(id: number, dto: UpdateContratoDto, usuario: string): Promise<Contrato> {
    const contrato = await this.contratosRepo.findOne({ where: { id } });
    if (!contrato) {
      throw new NotFoundException(`No existe el contrato con id ${id}`);
    }
    const anterior = {
      nombreContrato: contrato.nombreContrato,
      vigenciaDesde: contrato.vigenciaDesde,
      vigenciaHasta: contrato.vigenciaHasta,
      estado: contrato.estado,
      observaciones: contrato.observaciones,
    };

    Object.assign(contrato, dto);
    if (
      contrato.vigenciaDesde &&
      contrato.vigenciaHasta &&
      contrato.vigenciaDesde > contrato.vigenciaHasta
    ) {
      throw new BadRequestException('vigenciaDesde no puede ser posterior a vigenciaHasta');
    }
    const guardado = await this.contratosRepo.save(contrato);

    await this.auditoria.registrar({
      tabla: 'contratos',
      registroId: id,
      usuario,
      accion: 'UPDATE',
      valorAnterior: anterior,
      valorNuevo: dto,
    });
    return guardado;
  }

  // ----- Validaciones de creación ----------------------------------------

  private async validarCreacion(dto: CreateContratoDto): Promise<void> {
    const cliente = await this.clientesRepo.findOne({ where: { id: dto.clienteId } });
    if (!cliente) {
      throw new BadRequestException(`No existe el cliente con id ${dto.clienteId}`);
    }

    // Dedup dentro del propio contrato: el mismo par producto+concepto no puede
    // repetirse ni dentro de un item (hibrido) ni entre items distintos.
    const combinaciones = new Set<string>();
    for (const item of dto.items) {
      for (const c of item.conceptos) {
        const clave = `${c.productoId}-${c.conceptoId}`;
        if (combinaciones.has(clave)) {
          throw new BadRequestException(
            `El contrato repite la combinación producto ${c.productoId} / concepto ${c.conceptoId}.`,
          );
        }
        combinaciones.add(clave);
      }
      await this.validarItem(item);
    }

    // Un mismo servicio (producto+concepto) no puede estar reclamado por dos
    // contrato_item ACTIVOS del mismo cliente a la vez (aunque esten en
    // contratos distintos): si no, la ingesta de volumenes no sabria a cual
    // enganchar un volumen real.
    const yaReclamados = await this.itemConceptosRepo
      .createQueryBuilder('cic')
      .innerJoin('cic.contratoItem', 'ci')
      .innerJoin('ci.contrato', 'co')
      .where('co.cliente_id = :clienteId', { clienteId: dto.clienteId })
      .andWhere('ci.estado = :activo', { activo: 'activo' })
      .andWhere('co.estado = :activo', { activo: 'activo' })
      .getMany();
    for (const r of yaReclamados) {
      const clave = `${r.productoId}-${r.conceptoId}`;
      if (combinaciones.has(clave)) {
        throw new BadRequestException(
          `El cliente ya tiene un contrato activo para producto ${r.productoId} / concepto ${r.conceptoId} ` +
            '(contrato_item ' + r.contratoItemId + '); no puede repetirse en otro contrato.',
        );
      }
    }
  }

  private async validarItem(item: CreateContratoItemDto): Promise<void> {
    for (const c of item.conceptos) {
      const producto = await this.productosRepo.findOne({ where: { id: c.productoId } });
      if (!producto) {
        throw new BadRequestException(`No existe el producto con id ${c.productoId}`);
      }
      const concepto = await this.conceptosRepo.findOne({ where: { id: c.conceptoId } });
      if (!concepto) {
        throw new BadRequestException(`No existe el concepto con id ${c.conceptoId}`);
      }
      if (concepto.productoId !== c.productoId) {
        throw new BadRequestException(
          `El concepto ${c.conceptoId} no pertenece al producto ${c.productoId}.`,
        );
      }
    }
    this.tarifasValidation.validarTarifas(item.modeloCobro, item.tarifas);
  }
}
