import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Volumen } from './entities/volumen.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Producto } from '../productos/entities/producto.entity';
import { ConceptoFacturable } from '../productos/entities/concepto-facturable.entity';
import { ContratoItem } from '../contratos/entities/contrato-item.entity';
import { IngestaVolumenesDto } from './dto/ingesta-volumenes.dto';
import { ListVolumenesQueryDto } from './dto/list-volumenes-query.dto';
import { buildPaginated, PaginatedResult } from '../common/dto/paginated-result';

export interface ResultadoIngesta {
  procesados: number;
  insertados: number;
  actualizados: number;
  omitidos: { nit: string; motivo: string }[];
}

@Injectable()
export class VolumenesService {
  constructor(
    @InjectRepository(Volumen) private readonly volumenesRepo: Repository<Volumen>,
    @InjectRepository(Cliente) private readonly clientesRepo: Repository<Cliente>,
    @InjectRepository(Producto) private readonly productosRepo: Repository<Producto>,
    @InjectRepository(ConceptoFacturable) private readonly conceptosRepo: Repository<ConceptoFacturable>,
    @InjectRepository(ContratoItem) private readonly itemsRepo: Repository<ContratoItem>,
  ) {}

  /** Carga masiva de volúmenes. Resuelve cliente/producto/concepto por código. Idempotente. */
  async ingesta(dto: IngestaVolumenesDto): Promise<ResultadoIngesta> {
    const res: ResultadoIngesta = { procesados: 0, insertados: 0, actualizados: 0, omitidos: [] };

    // Cachés para no repetir consultas
    const cacheProd = new Map<string, Producto | null>();
    const cacheConc = new Map<string, ConceptoFacturable | null>();
    const cacheCli = new Map<string, Cliente | null>();

    for (const it of dto.items) {
      res.procesados++;
      const nit = it.nit.trim();

      let cliente = cacheCli.get(nit);
      if (cliente === undefined) {
        cliente = await this.clientesRepo.findOne({ where: { nit } });
        cacheCli.set(nit, cliente);
      }
      if (!cliente) {
        res.omitidos.push({ nit, motivo: 'cliente no existe' });
        continue;
      }

      const pcod = it.productoCodigo.trim().toUpperCase();
      let producto = cacheProd.get(pcod);
      if (producto === undefined) {
        producto = await this.productosRepo.findOne({ where: { codigo: pcod } });
        cacheProd.set(pcod, producto);
      }
      if (!producto) {
        res.omitidos.push({ nit, motivo: `producto ${pcod} no existe` });
        continue;
      }

      const ckey = `${producto.id}:${it.conceptoCodigo.trim().toUpperCase()}`;
      let concepto = cacheConc.get(ckey);
      if (concepto === undefined) {
        concepto = await this.conceptosRepo.findOne({
          where: { productoId: producto.id, codigo: it.conceptoCodigo.trim().toUpperCase() },
        });
        cacheConc.set(ckey, concepto);
      }
      if (!concepto) {
        res.omitidos.push({ nit, motivo: `concepto ${it.conceptoCodigo} no existe en ${pcod}` });
        continue;
      }

      // Intento de enlace con la tarifa de Etapa 1 (mismo cliente+producto+concepto).
      // El item puede ser "hibrido" (agrupa varios servicios): el join es contra
      // contrato_item_conceptos, no contra columnas propias del item.
      const item = await this.itemsRepo
        .createQueryBuilder('ci')
        .innerJoin('ci.contrato', 'c')
        .innerJoin('ci.conceptos', 'cc')
        .where('c.cliente_id = :cid AND cc.producto_id = :pid AND cc.concepto_id = :coid', {
          cid: cliente.id,
          pid: producto.id,
          coid: concepto.id,
        })
        .getOne();

      const existente = await this.volumenesRepo.findOne({
        where: { clienteId: cliente.id, productoId: producto.id, conceptoId: concepto.id, anio: it.anio, mes: it.mes },
      });

      if (existente) {
        existente.cantidad = it.cantidad;
        existente.contratoItemId = item?.id ?? existente.contratoItemId ?? null;
        existente.origen = it.origen ?? existente.origen;
        await this.volumenesRepo.save(existente);
        res.actualizados++;
      } else {
        await this.volumenesRepo.save(
          this.volumenesRepo.create({
            clienteId: cliente.id,
            contratoItemId: item?.id ?? null,
            productoId: producto.id,
            conceptoId: concepto.id,
            anio: it.anio,
            mes: it.mes,
            cantidad: it.cantidad,
            origen: it.origen ?? null,
          }),
        );
        res.insertados++;
      }
    }

    return res;
  }

  async findAll(query: ListVolumenesQueryDto): Promise<PaginatedResult<Volumen>> {
    const { page, limit, anio, mes, busqueda } = query;
    const qb = this.volumenesRepo.createQueryBuilder('v').leftJoinAndSelect('v.cliente', 'cli');
    if (anio) qb.andWhere('v.anio = :anio', { anio });
    if (mes) qb.andWhere('v.mes = :mes', { mes });
    if (busqueda) qb.andWhere('(cli.nit LIKE :b OR cli.razon_social LIKE :b)', { b: `%${busqueda}%` });
    qb.orderBy('v.cantidad', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return buildPaginated(data, total, page, limit);
  }
}
