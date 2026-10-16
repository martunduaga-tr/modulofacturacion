import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, Max, Min, ValidateNested } from 'class-validator';
import { RecargoFijoValorDto } from './recargo-fijo-valor.dto';

/** Define/reemplaza el conjunto de recargos fijos de un item para un año (puede quedar vacío: sin recargo ese año). */
export class SetRecargosDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt({ message: 'anio debe ser un entero' })
  @Min(2000)
  @Max(2100)
  anio: number;

  @ApiProperty({ type: [RecargoFijoValorDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecargoFijoValorDto)
  recargos: RecargoFijoValorDto[];
}
