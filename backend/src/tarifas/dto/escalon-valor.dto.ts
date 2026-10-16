import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';

/** Un escalón (sin año: el año vive en el bundle TarifaAnioDto que lo contiene). */
export class EscalonValorDto {
  @ApiProperty({ example: 0, description: 'Volumen desde (inclusive)' })
  @Type(() => Number)
  @IsInt({ message: 'volumenDesde debe ser un entero' })
  @Min(0, { message: 'volumenDesde no puede ser negativo' })
  volumenDesde: number;

  @ApiProperty({ example: 100000, description: 'Volumen hasta (inclusive)' })
  @Type(() => Number)
  @IsInt({ message: 'volumenHasta debe ser un entero' })
  @Min(0, { message: 'volumenHasta no puede ser negativo' })
  volumenHasta: number;

  @ApiProperty({ example: 50904, description: 'Precio unitario (> 0)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'precioUnitario debe ser numérico (hasta 4 decimales)' })
  @IsPositive({ message: 'precioUnitario debe ser mayor que 0' })
  precioUnitario: number;

  @ApiPropertyOptional({ example: 0.052, description: 'IPC aplicado (metadato/referencia)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  ipcAplicado?: number;
}
