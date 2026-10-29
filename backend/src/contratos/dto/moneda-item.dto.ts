import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { Moneda } from '../entities/contrato-item.entity';

export class MonedaItemDto {
  @ApiProperty({ enum: ['COP', 'USD'] })
  @IsIn(['COP', 'USD'], { message: "moneda debe ser 'COP' o 'USD'" })
  moneda: Moneda;
}
