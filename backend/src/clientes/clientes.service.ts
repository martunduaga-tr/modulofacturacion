import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente } from './entities/cliente.entity';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ListClientesQueryDto } from './dto/list-clientes-query.dto';
import { isUniqueViolation } from '../common/database/unique-violation';
import { buildPaginated, PaginatedResult } from '../common/dto/paginated-result';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PerfilTributarioDto } from './dto/perfil-tributario.dto';
import { ComentarioFactura, OrigenComentario } from './entities/comentario-factura.entity';
import { ComentarioFacturaDto } from './dto/comentario-factura.dto';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clientesRepo: Repository<Cliente>,
    @InjectRepository(ComentarioFactura)
    private readonly comentariosRepo: Repository<ComentarioFactura>,
    private readonly auditoria: AuditoriaService,
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

  /**
   * Retenciones del cliente. Cambian lo que se le cobra (cartera),
   * así que cada cambio queda en auditoría con el valor anterior y el nuevo.
   */
  async actualizarPerfilTributario(id: number, dto: PerfilTributarioDto, usuario: string): Promise<Cliente> {
    const cliente = await this.findOne(id);
    const anterior = {
      tasaRtefte: cliente.tasaRtefte,
      tasaRteiva: cliente.tasaRteiva,
      tasaRteica: cliente.tasaRteica,
    };
    Object.assign(cliente, {
      tasaRtefte: dto.tasaRtefte,
      tasaRteiva: dto.tasaRteiva,
      tasaRteica: dto.tasaRteica,
    });
    const guardado = await this.clientesRepo.save(cliente);
    await this.auditoria.registrar({
      tabla: 'clientes',
      registroId: id,
      usuario,
      accion: 'UPDATE',
      valorAnterior: anterior,
      valorNuevo: { ...dto, campo: 'perfil_tributario' },
    });
    return guardado;
  }

  async comentariosFactura(clienteId: number): Promise<ComentarioFactura[]> {
    await this.findOne(clienteId);
    return this.comentariosRepo.find({ where: { clienteId }, order: { clasificador: 'ASC' } });
  }

  /**
   * Crea, cambia o borra (comentario vacío) el comentario de un clasificador.
   * Lo que escribe Contabilidad queda como origen 'manual' y en auditoría.
   */
  async guardarComentarioFactura(
    clienteId: number,
    dto: ComentarioFacturaDto,
    usuario: string,
    origen: OrigenComentario = 'manual',
  ): Promise<ComentarioFactura | null> {
    await this.findOne(clienteId);
    const texto = dto.comentario.trim().replace(/\s+/g, ' ');
    const actual = await this.comentariosRepo.findOne({ where: { clienteId, clasificador: dto.clasificador } });
    if ((actual?.comentario ?? '') === texto) return actual;
    // Antes de merge: merge modifica `actual`.
    const anterior = actual ? { clasificador: actual.clasificador, comentario: actual.comentario } : undefined;

    let guardado: ComentarioFactura | null = null;
    if (!texto) {
      await this.comentariosRepo.delete(actual!.id);
    } else {
      guardado = await this.comentariosRepo.save(
        this.comentariosRepo.merge(actual ?? this.comentariosRepo.create({ clienteId, clasificador: dto.clasificador }), { comentario: texto, origen }),
      );
    }
    await this.auditoria.registrar({
      tabla: 'cliente_comentarios_factura',
      registroId: actual?.id ?? guardado!.id,
      usuario,
      accion: !actual ? 'INSERT' : texto ? 'UPDATE' : 'DELETE',
      valorAnterior: anterior,
      valorNuevo: { clienteId, clasificador: dto.clasificador, comentario: texto || null, origen },
    });
    return guardado;
  }
}
