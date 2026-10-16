import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente } from './entities/cliente.entity';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ListClientesQueryDto } from './dto/list-clientes-query.dto';
import { isUniqueViolation } from '../common/database/unique-violation';
import { buildPaginated, PaginatedResult } from '../common/dto/paginated-result';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clientesRepo: Repository<Cliente>,
  ) {}

  async findAll(query: ListClientesQueryDto): Promise<PaginatedResult<Cliente>> {
    const { page, limit, busqueda, estado } = query;
    const qb = this.clientesRepo.createQueryBuilder('c');

    if (estado) {
      qb.andWhere('c.estado = :estado', { estado });
    }
    if (busqueda) {
      qb.andWhere('(c.nit LIKE :b OR c.razon_social LIKE :b)', { b: `%${busqueda}%` });
    }

    qb.loadRelationCountAndMap('c.contratosCount', 'c.contratos')
      .orderBy('c.razonSocial', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return buildPaginated(data, total, page, limit);
  }

  async findOne(id: number): Promise<Cliente> {
    const cliente = await this.clientesRepo.findOne({
      where: { id },
      relations: {
        contratos: { items: { conceptos: { producto: true, concepto: true } } },
      },
    });
    if (!cliente) {
      throw new NotFoundException(`No existe el cliente con id ${id}`);
    }
    return cliente;
  }

  async create(dto: CreateClienteDto): Promise<Cliente> {
    const nit = dto.nit.trim();
    const cliente = this.clientesRepo.create({ ...dto, nit });
    try {
      return await this.clientesRepo.save(cliente);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Ya existe un cliente con el NIT '${nit}'`);
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateClienteDto): Promise<Cliente> {
    const cliente = await this.findOne(id);
    if (dto.nit) {
      dto.nit = dto.nit.trim();
    }
    Object.assign(cliente, dto);
    try {
      return await this.clientesRepo.save(cliente);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Ya existe un cliente con el NIT '${cliente.nit}'`);
      }
      throw error;
    }
  }
}
