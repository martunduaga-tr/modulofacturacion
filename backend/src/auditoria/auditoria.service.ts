import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccionAuditoria, AuditoriaCambio } from './entities/auditoria-cambio.entity';
import { ListAuditoriaQueryDto } from './dto/list-auditoria-query.dto';
import { buildPaginated, PaginatedResult } from '../common/dto/paginated-result';

export interface RegistroAuditoria {
  tabla: string;
  registroId: number;
  usuario: string;
  accion: AccionAuditoria;
  valorAnterior?: unknown;
  valorNuevo?: unknown;
}

@Injectable()
export class AuditoriaService {
  constructor(
    @InjectRepository(AuditoriaCambio)
    private readonly auditoriaRepo: Repository<AuditoriaCambio>,
  ) {}

  /**
   * Registra un cambio. valorAnterior/valorNuevo se serializan a JSON.
   * Los servicios de escritura (tarifas, contratos, parámetros) llaman a esto
   * dentro de su transacción para garantizar trazabilidad fiscal.
   */
  async registrar(input: RegistroAuditoria, repo?: Repository<AuditoriaCambio>): Promise<void> {
    const repositorio = repo ?? this.auditoriaRepo;
    const registro = repositorio.create({
      tabla: input.tabla,
      registroId: input.registroId,
      usuario: input.usuario,
      accion: input.accion,
      valorAnterior: input.valorAnterior !== undefined ? JSON.stringify(input.valorAnterior) : null,
      valorNuevo: input.valorNuevo !== undefined ? JSON.stringify(input.valorNuevo) : null,
    });
    await repositorio.save(registro);
  }

  async findAll(query: ListAuditoriaQueryDto): Promise<PaginatedResult<AuditoriaCambio>> {
    const { page, limit, tabla, desde, hasta } = query;
    const qb = this.auditoriaRepo.createQueryBuilder('a');

    if (tabla) {
      qb.andWhere('a.tabla = :tabla', { tabla });
    }
    if (desde) {
      qb.andWhere('a.fecha >= :desde', { desde });
    }
    if (hasta) {
      // hasta inclusivo: hasta el final del día indicado
      qb.andWhere('a.fecha < DATEADD(day, 1, CAST(:hasta AS date))', { hasta });
    }

    qb.orderBy('a.fecha', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return buildPaginated(data, total, page, limit);
  }
}
