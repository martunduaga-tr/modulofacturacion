import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListProductosQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Texto a buscar en código o nombre' })
  @IsOptional()
  @IsString()
  busqueda?: string;

  @ApiPropertyOptional({ enum: ['activo', 'inactivo'] })
  @IsOptional()
  @IsIn(['activo', 'inactivo'], { message: "estado debe ser 'activo' o 'inactivo'" })
  estado?: 'activo' | 'inactivo';
}
