import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RechazarPreliquidadoDto {
  @ApiProperty({ example: 'La tarifa del contrato no coincide con el otrosí vigente' })
  @IsString({ message: 'El motivo del rechazo es obligatorio' })
  @IsNotEmpty({ message: 'El motivo del rechazo es obligatorio' })
  @MaxLength(500, { message: 'El motivo no puede superar 500 caracteres' })
  motivo: string;
}
