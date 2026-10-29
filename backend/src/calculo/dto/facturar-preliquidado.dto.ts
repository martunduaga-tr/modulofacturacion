import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Matches, Min } from 'class-validator';

export class FacturarPreliquidadoDto {
  @ApiProperty({ example: '2026-11-05', description: 'Fecha de emisión de la factura (AAAA-MM-DD). Fija la TRM de los cobros en USD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaFactura debe ser AAAA-MM-DD' })
  fechaFactura: string;

  @ApiPropertyOptional({ example: 3157.94, description: 'Solo USD: TRM a usar si Contabilidad la corrige. Vacío = la oficial de esa fecha.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'trm debe ser numérica (hasta 6 decimales)' })
  @Min(0.000001, { message: 'La TRM debe ser mayor que 0' })
  trm?: number;
}
