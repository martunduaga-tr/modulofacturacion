import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class ExportarCobrosDto {
  @ApiProperty({ type: [Number], description: 'Ids de los pre-liquidados, en el orden en que deben salir' })
  @IsArray()
  @ArrayMinSize(1, { message: 'No hay cobros para descargar' })
  @ArrayMaxSize(3000, { message: 'Máximo 3000 cobros por archivo' })
  @IsInt({ each: true })
  ids: number[];
}
