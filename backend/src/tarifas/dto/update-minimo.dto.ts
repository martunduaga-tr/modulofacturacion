import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsPositive } from 'class-validator';

export class UpdateMinimoDto {
  @ApiProperty({ example: 190000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive({ message: 'valorMinimo debe ser mayor que 0' })
  valorMinimo: number;

  @ApiPropertyOptional({ example: 1000, description: 'Tope de la banda que cubre valorMinimo (franquicia)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'volumenTope debe ser un entero' })
  @IsPositive({ message: 'volumenTope debe ser mayor que 0' })
  volumenTope?: number;
}
