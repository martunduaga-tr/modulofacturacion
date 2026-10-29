import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { MOTIVOS_REVISION, MotivoRevision } from '../entities/alerta-revision.entity';

export class RevisarAlertaDto {
  @ApiProperty({ example: 'variacion_mensual|182|iFactura-Emision|2026-09' })
  @IsString({ message: 'Falta la clave de la alerta' })
  @IsNotEmpty({ message: 'Falta la clave de la alerta' })
  @MaxLength(200)
  clave: string;

  @ApiProperty({ enum: MOTIVOS_REVISION })
  @IsIn(MOTIVOS_REVISION, { message: 'Elija un motivo de la lista' })
  motivo: MotivoRevision;

  /** Obligatoria si el motivo es "otro" o "se ajusta la factura": hay que dejar dicho qué se hizo. */
  @ApiPropertyOptional({ example: 'El cliente confirmó cierre por inventario el 14-sep' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((o: RevisarAlertaDto) => o.motivo === 'otro' || o.motivo === 'ajuste_factura' || !!o.nota)
  @IsString({ message: 'Escriba una nota que explique la revisión' })
  @IsNotEmpty({ message: 'Escriba una nota que explique la revisión' })
  @MaxLength(500, { message: 'La nota admite máximo 500 caracteres' })
  nota?: string;
}
