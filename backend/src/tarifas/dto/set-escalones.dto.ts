import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, Max, Min, ValidateNested } from 'class-validator';
import { EscalonValorDto } from './escalon-valor.dto';

/** Define/reemplaza el conjunto de escalones de un item para un año. */
export class SetEscalonesDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt({ message: 'anio debe ser un entero' })
  @Min(2000)
  @Max(2100)
  anio: number;

  @ApiProperty({ type: [EscalonValorDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Se requiere al menos un escalón' })
  @ValidateNested({ each: true })
  @Type(() => EscalonValorDto)
  escalones: EscalonValorDto[];
}
