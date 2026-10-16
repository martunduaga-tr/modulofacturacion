import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Producto } from './entities/producto.entity';
import { ConceptoFacturable } from './entities/concepto-facturable.entity';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { CreateConceptoDto } from './dto/create-concepto.dto';
import { UpdateConceptoDto } from './dto/update-concepto.dto';
import { ListProductosQueryDto } from './dto/list-productos-query.dto';
import { isUniqueViolation } from '../common/database/unique-violation';
import { buildPaginated, PaginatedResult } from '../common/dto/paginated-result';

@Injectable()
export class ProductosService {
  constructor(
    @InjectRepository(Producto)
    private readonly productosRepo: Repository<Producto>,
    @InjectRepository(ConceptoFacturable)
    private readonly conceptosRepo: Repository<ConceptoFacturable>,
  ) {}

  // ----- Productos --------------------------------------------------------

  async findAll(query: ListProductosQueryDto): Promise<PaginatedResult<Producto>> {
    const { page, limit, busqueda, estado } = query;
    const qb = this.productosRepo.createQueryBuilder('p');

    if (estado) {
      qb.andWhere('p.estado = :estado', { estado });
    }
    if (busqueda) {
      qb.andWhere('(p.codigo LIKE :b OR p.nombre LIKE :b)', { b: `%${busqueda}%` });
    }

    qb.orderBy('p.nombre', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return buildPaginated(data, total, page, limit);
  }

  async findOne(id: number): Promise<Producto> {
    const producto = await this.productosRepo.findOne({
      where: { id },
      relations: { conceptos: true },
    });
    if (!producto) {
      throw new NotFoundException(`No existe el producto con id ${id}`);
    }
    return producto;
  }

  async create(dto: CreateProductoDto): Promise<Producto> {
    const codigo = dto.codigo.trim().toUpperCase();
    const producto = this.productosRepo.create({ ...dto, codigo });
    try {
      return await this.productosRepo.save(producto);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Ya existe un producto con el código '${codigo}'`);
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateProductoDto): Promise<Producto> {
    const producto = await this.findOne(id);
    if (dto.codigo) {
      dto.codigo = dto.codigo.trim().toUpperCase();
    }
    Object.assign(producto, dto);
    try {
      return await this.productosRepo.save(producto);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Ya existe un producto con el código '${producto.codigo}'`);
      }
      throw error;
    }
  }

  // ----- Conceptos facturables -------------------------------------------

  async listConceptos(productoId: number): Promise<ConceptoFacturable[]> {
    await this.findOne(productoId); // valida existencia del producto
    return this.conceptosRepo.find({
      where: { productoId },
      order: { nombre: 'ASC' },
    });
  }

  async createConcepto(productoId: number, dto: CreateConceptoDto): Promise<ConceptoFacturable> {
    await this.findOne(productoId);
    const codigo = dto.codigo.trim().toUpperCase();
    const concepto = this.conceptosRepo.create({ ...dto, codigo, productoId });
    try {
      return await this.conceptosRepo.save(concepto);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`El producto ya tiene un concepto con el código '${codigo}'`);
      }
      throw error;
    }
  }

  async updateConcepto(
    productoId: number,
    conceptoId: number,
    dto: UpdateConceptoDto,
  ): Promise<ConceptoFacturable> {
    const concepto = await this.conceptosRepo.findOne({
      where: { id: conceptoId, productoId },
    });
    if (!concepto) {
      throw new NotFoundException(
        `No existe el concepto ${conceptoId} en el producto ${productoId}`,
      );
    }
    if (dto.codigo) {
      dto.codigo = dto.codigo.trim().toUpperCase();
    }
    Object.assign(concepto, dto);
    try {
      return await this.conceptosRepo.save(concepto);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `El producto ya tiene un concepto con el código '${concepto.codigo}'`,
        );
      }
      throw error;
    }
  }
}
