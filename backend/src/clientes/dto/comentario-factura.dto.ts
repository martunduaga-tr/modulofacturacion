import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { CLASIFICADORES, Clasificador } from '../entities/comentario-factura.entity';

/** Comentario de la línea de factura. Vacío = se borra y la línea queda solo con el clasificador. */
export class ComentarioFacturaDto {
  @ApiProperty({ enum: CLASIFICADORES, example: 'Emisión' })
  @IsIn(CLASIFICADORES, { message: `clasificador debe ser uno de: ${CLASIFICADORES.join(', ')}` })
  clasificador: Clasificador;

  @ApiProperty({ example: 'Contrato No. SG-07-2018 Funcionario validador …' })
  @IsString()
  @MaxLength(500, { message: 'El comentario admite máximo 500 caracteres' })
  comentario: string;
}
