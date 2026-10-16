import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsPositive } from 'class-validator';

export class UpdateFijaDto {
  @ApiProperty({ example: 250000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive({ message: 'valorFijo debe ser mayor que 0' })
  valorFijo: number;
}
