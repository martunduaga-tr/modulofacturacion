import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListPreliquidadosQueryDto extends PaginationQueryDto {
  // El dashboard carga todo el mes (hasta ~700), así que subimos el tope de página.
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 2000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  limit: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  anio?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes?: number;

  @ApiPropertyOptional({ enum: ['calculado', 'aprobado', 'rechazado', 'facturado'] })
  @IsOptional()
  @IsIn(['calculado', 'aprobado', 'rechazado', 'facturado'])
  estado?: string;

  @ApiPropertyOptional({ description: 'Buscar por NIT o razón social' })
  @IsOptional()
  @IsString()
  busqueda?: string;
}
