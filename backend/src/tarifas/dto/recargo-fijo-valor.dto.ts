import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsPositive, IsString, MaxLength } from 'class-validator';

/** Un recargo fijo (sin año: el año vive en el bundle TarifaAnioDto que lo contiene). */
export class RecargoFijoValorDto {
  @ApiProperty({ example: 'MANTENIMIENTO', description: 'Etiqueta del recargo' })
  @IsString()
  @IsNotEmpty({ message: 'concepto no puede estar vacío' })
  @MaxLength(50)
  concepto: string;

  @ApiProperty({ example: 1839270, description: 'Monto fijo mensual (> 0), se suma al subtotal' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive({ message: 'valor debe ser mayor que 0' })
  valor: number;
}
