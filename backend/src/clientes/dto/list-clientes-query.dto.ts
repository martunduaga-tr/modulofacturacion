import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListClientesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Texto a buscar en NIT o razón social' })
  @IsOptional()
  @IsString()
  busqueda?: string;

  @ApiPropertyOptional({ enum: ['activo', 'retirado'] })
  @IsOptional()
  @IsIn(['activo', 'retirado'], { message: "estado debe ser 'activo' o 'retirado'" })
  estado?: 'activo' | 'retirado';
}
