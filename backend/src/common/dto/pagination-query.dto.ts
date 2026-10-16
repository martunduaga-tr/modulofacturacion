import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Base de paginación para los listados. Cada módulo la extiende y agrega sus
 * propios filtros (busqueda, estado, etc.). Establece el patrón de RF-1.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Número de página (1-based)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un entero' })
  @Min(1, { message: 'page debe ser >= 1' })
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, description: 'Tamaño de página' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1, { message: 'limit debe ser >= 1' })
  @Max(100, { message: 'limit no puede superar 100' })
  limit: number = 20;
}
