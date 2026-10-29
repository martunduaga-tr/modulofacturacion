import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { TipoSolicitud } from '../express-reglas';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
// En multipart todo llega como texto: '' cuenta como "no enviado".
const vacioANulo = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

/**
 * Campos de una solicitud Express (llegan como multipart, junto al PDF).
 * Las reglas que dependen del tipo están en express-reglas.ts › validarSolicitud.
 */
export class SolicitudExpressDto {
  @ApiProperty({ enum: ['NUEVO', 'RENOVACION', 'COBRO_ADICIONAL'] })
  @IsIn(['NUEVO', 'RENOVACION', 'COBRO_ADICIONAL'], { message: 'tipo debe ser NUEVO, RENOVACION o COBRO_ADICIONAL' })
  tipo: TipoSolicitud;

  @ApiPropertyOptional({ description: 'Suscripción (contrato) existente: RENOVACION y COBRO_ADICIONAL' })
  @Transform(vacioANulo)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contratoId?: number;

  @ApiPropertyOptional({ description: 'Cliente nuevo (NUEVO)' })
  @Transform(vacioANulo)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nit?: string;

  @ApiPropertyOptional()
  @Transform(vacioANulo)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  razonSocial?: string;

  @ApiPropertyOptional({ example: 'iFactura-Recepcion', description: 'Servicio tal como lo reporta Data (NUEVO)' })
  @Transform(vacioANulo)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  servicio?: string;

  @ApiPropertyOptional({ example: 400 })
  @Transform(vacioANulo)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tope?: number;

  @ApiPropertyOptional({ example: 731864 })
  @Transform(vacioANulo)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valorAnual?: number;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @Transform(vacioANulo)
  @IsOptional()
  @Matches(FECHA, { message: 'vigenciaDesde debe ser AAAA-MM-DD' })
  vigenciaDesde?: string;

  @ApiPropertyOptional({ example: '2027-06-30', description: 'Vacío = 365 días desde el inicio' })
  @Transform(vacioANulo)
  @IsOptional()
  @Matches(FECHA, { message: 'vigenciaHasta debe ser AAAA-MM-DD' })
  vigenciaHasta?: string;

  @ApiPropertyOptional({ example: 0.035 })
  @Transform(vacioANulo)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tasaRtefte?: number;

  @ApiPropertyOptional({ example: 0 })
  @Transform(vacioANulo)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tasaRteiva?: number;

  @ApiPropertyOptional({ example: 0 })
  @Transform(vacioANulo)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tasaRteica?: number;

  @ApiPropertyOptional({ example: 20, description: 'Documentos adicionales a cobrar (los digita Comercial)' })
  @Transform(vacioANulo)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cantidadAdicional?: number;

  @ApiPropertyOptional({ example: 1500 })
  @Transform(vacioANulo)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  precioAdicional?: number;

  @ApiPropertyOptional({ description: 'COBRO_ADICIONAL: el cliente no renueva (al aprobar se da de baja la suscripción)' })
  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  @IsBoolean()
  noRenueva?: boolean;

  @ApiPropertyOptional()
  @Transform(vacioANulo)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}

export class RevisionDto {
  @ApiProperty({ example: 'El valor anual no coincide con el PDF adjunto' })
  @IsString()
  @IsNotEmpty({ message: 'El comentario es obligatorio' })
  @MaxLength(1000)
  comentario: string;
}
