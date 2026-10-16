import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListLineasQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Texto a buscar en NIT, razón social, referencia o concepto' })
  @IsOptional()
  @IsString()
  busqueda?: string;

  @ApiPropertyOptional({ description: 'Filtrar por cliente' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clienteId?: number;

  @ApiPropertyOptional({ description: 'Filtrar por item de contrato (Etapa 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contratoItemId?: number;

  @ApiPropertyOptional({ enum: ['activo', 'inactivo'] })
  @IsOptional()
  @IsIn(['activo', 'inactivo'])
  estado?: 'activo' | 'inactivo';
}
