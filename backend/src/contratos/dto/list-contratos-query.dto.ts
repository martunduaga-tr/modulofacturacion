import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListContratosQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Texto a buscar en NIT, razón social o nombre del contrato' })
  @IsOptional()
  @IsString()
  busqueda?: string;

  @ApiPropertyOptional({ description: 'Filtrar contratos que tengan un item de este producto' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productoId?: number;

  @ApiPropertyOptional({ enum: ['volumen_escalonado', 'minimo_garantizado', 'fijo_mensual', 'bolsa'] })
  @IsOptional()
  @IsIn(['volumen_escalonado', 'minimo_garantizado', 'fijo_mensual', 'bolsa'])
  modeloCobro?: 'volumen_escalonado' | 'minimo_garantizado' | 'fijo_mensual' | 'bolsa';

  @ApiPropertyOptional({ enum: ['activo', 'inactivo'] })
  @IsOptional()
  @IsIn(['activo', 'inactivo'])
  estado?: 'activo' | 'inactivo';
}
