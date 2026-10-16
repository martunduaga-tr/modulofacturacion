import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Edita solo la cabecera del contrato. Los items y sus tarifas se gestionan
 * por los endpoints de tarifas (no se tocan masivamente desde aquí).
 */
export class UpdateContratoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nombreContrato?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString({}, { message: 'vigenciaDesde debe ser una fecha YYYY-MM-DD' })
  vigenciaDesde?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString({}, { message: 'vigenciaHasta debe ser una fecha YYYY-MM-DD' })
  vigenciaHasta?: string;

  @ApiPropertyOptional({ enum: ['activo', 'inactivo'] })
  @IsOptional()
  @IsIn(['activo', 'inactivo'])
  estado?: 'activo' | 'inactivo';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observaciones?: string;
}
