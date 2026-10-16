import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { EscalonValorDto } from './escalon-valor.dto';
import { RecargoFijoValorDto } from './recargo-fijo-valor.dto';

/**
 * Tarifa de un año para un contrato_item. Según el modelo de cobro del item:
 *  - volumen_escalonado: escalones (>=1)
 *  - minimo_garantizado: escalones (>=1) + valorMinimo + volumenTopeMinimo
 *      (subtotal = minimo si volumen<=tope; si no, minimo + (volumen-tope)*tarifa)
 *  - fijo_mensual:       valorFijo
 *  - bolsa:              escalones (>=1), precioUnitario interpretado como monto
 *      plano de la banda (no se multiplica por volumen)
 *  - recargosFijos: opcional, disponible para CUALQUIER modelo (ej. MANTENIMIENTO
 *      de SAN CARLOS); se suma siempre al subtotal.
 * La coherencia se valida en TarifasValidationService.
 */
export class TarifaAnioDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt({ message: 'anio debe ser un entero' })
  @Min(2000)
  @Max(2100)
  anio: number;

  @ApiPropertyOptional({ type: [EscalonValorDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Si hay escalones, debe haber al menos uno' })
  @ValidateNested({ each: true })
  @Type(() => EscalonValorDto)
  escalones?: EscalonValorDto[];

  @ApiPropertyOptional({ example: 183906, description: 'Piso del mínimo garantizado (> 0)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive({ message: 'valorMinimo debe ser mayor que 0' })
  valorMinimo?: number;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Tope de la banda que cubre valorMinimo (franquicia). Requerido junto con valorMinimo.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'volumenTopeMinimo debe ser un entero' })
  @IsPositive({ message: 'volumenTopeMinimo debe ser mayor que 0' })
  volumenTopeMinimo?: number;

  @ApiPropertyOptional({ example: 250000, description: 'Valor fijo mensual (> 0)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive({ message: 'valorFijo debe ser mayor que 0' })
  valorFijo?: number;

  @ApiPropertyOptional({
    type: [RecargoFijoValorDto],
    description: 'Cargos adicionales fijos mensuales, se suman al subtotal sin importar el modelo (ej. MANTENIMIENTO)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Si hay recargosFijos, debe haber al menos uno' })
  @ValidateNested({ each: true })
  @Type(() => RecargoFijoValorDto)
  recargosFijos?: RecargoFijoValorDto[];
}
