import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class CreateItemConceptoDto {
  @ApiProperty({ example: 1, description: 'ID del producto' })
  @Type(() => Number)
  @IsInt()
  productoId: number;

  @ApiProperty({ example: 1, description: 'ID del concepto facturable (debe pertenecer al producto)' })
  @Type(() => Number)
  @IsInt()
  conceptoId: number;
}
