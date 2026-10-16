import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LineaFacturacion } from './entities/linea-facturacion.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { ContratoItem } from '../contratos/entities/contrato-item.entity';
import { CreateLineaDto } from './dto/create-linea.dto';
import { UpdateLineaDto } from './dto/update-linea.dto';
import { ListLineasQueryDto } from './dto/list-lineas-query.dto';
import { isUniqueViolation } from '../common/database/unique-violation';
import { buildPaginated, PaginatedResult } from '../common/dto/paginated-result';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class FacturacionService {
  constructor(
    @InjectRepository(LineaFacturacion)
    private readonly lineasRepo: Repository<LineaFacturacion>,
    @InjectRepository(Cliente)
    private readonly clientesRepo: Repository<Cliente>,
    @InjectRepository(ContratoItem)
    private readonly itemsRepo: Repository<ContratoItem>,
    private readonly auditoria: AuditoriaService,
  ) {}

  async findAll(query: ListLineasQueryDto): Promise<PaginatedResult<LineaFacturacion>> {
    const { page, limit, busqueda, clienteId, contratoItemId, estado } = query;
    const qb = this.lineasRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.cliente', 'cli')
      .leftJoinAndSelect('l.contratoItem', 'it')
      .leftJoinAndSelect('it.conceptos', 'cc')
      .leftJoinAndSelect('cc.producto', 'prod')
      .leftJoinAndSelect('cc.concepto', 'con');

    if (estado) qb.andWhere('l.estado = :estado', { estado });
    if (clienteId) qb.andWhere('l.cliente_id = :clienteId', { clienteId });
    if (contratoItemId) qb.andWhere('l.contrato_item_id = :contratoItemId', { contratoItemId });
    if (busqueda) {
      qb.andWhere(
        '(cli.nit LIKE :b OR cli.razon_social LIKE :b OR l.referencia LIKE :b OR l.concepto LIKE :b)',
        { b: `%${busqueda}%` },
      );
    }

    qb.orderBy('cli.razonSocial', 'ASC')
      .addOrderBy('l.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return buildPaginated(data, total, page, limit);
  }

  async findOne(id: number): Promise<LineaFacturacion> {
    const linea = await this.lineasRepo.findOne({
      where: { id },
      relations: { cliente: true, contratoItem: { conceptos: { producto: true, concepto: true } } },
    });
    if (!linea) throw new NotFoundException(`No existe la línea de facturación ${id}`);
    return linea;
  }

  async create(dto: CreateLineaDto, usuario: string): Promise<LineaFacturacion> {
    await this.validarReferencias(dto.clienteId, dto.contratoItemId);
    const linea = this.lineasRepo.create({ ...dto, contratoItemId: dto.contratoItemId ?? null });
    try {
      const guardado = await this.lineasRepo.save(linea);
      await this.auditoria.registrar({
        tabla: 'lineas_facturacion',
        registroId: guardado.id,
        usuario,
        accion: 'INSERT',
        valorNuevo: dto,
      });
      return this.findOne(guardado.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Ya existe una línea de facturación para ese item de contrato.');
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateLineaDto, usuario: string): Promise<LineaFacturacion> {
    const linea = await this.findOne(id);
    if (dto.contratoItemId !== undefined || dto.clienteId !== undefined) {
      await this.validarReferencias(dto.clienteId ?? linea.clienteId, dto.contratoItemId ?? undefined);
    }
    const anterior = { ...linea, cliente: undefined, contratoItem: undefined };
    Object.assign(linea, dto);
    try {
      const guardado = await this.lineasRepo.save(linea);
      await this.auditoria.registrar({
        tabla: 'lineas_facturacion',
        registroId: id,
        usuario,
        accion: 'UPDATE',
        valorAnterior: anterior,
        valorNuevo: dto,
      });
      return this.findOne(guardado.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Ya existe una línea de facturación para ese item de contrato.');
      }
      throw error;
    }
  }

  private async validarReferencias(clienteId: number, contratoItemId?: number): Promise<void> {
    const cliente = await this.clientesRepo.findOne({ where: { id: clienteId } });
    if (!cliente) throw new BadRequestException(`No existe el cliente ${clienteId}`);
    if (contratoItemId != null) {
      const item = await this.itemsRepo.findOne({ where: { id: contratoItemId } });
      if (!item) throw new BadRequestException(`No existe el item de contrato ${contratoItemId}`);
    }
  }
}
