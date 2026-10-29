import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

/**
 * Retenciones que practica el cliente. Las tasas van como fracción
 * (0.035 = 3,5%) y son obligatorias: en julio las reales no coincidieron con
 * las globales, así que no se deja ninguna "por defecto" desde la pantalla.
 * El segmento no va aquí: es de cada contrato (ver clientes/segmento.ts).
 */
export class PerfilTributarioDto {
  @ApiProperty({ example: 0.035, description: 'Retención en la fuente (fracción)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'RteFte: máximo 6 decimales' })
  @Min(0, { message: 'RteFte no puede ser negativa' })
  @Max(0.999999, { message: 'RteFte debe ser una fracción (0.035 = 3,5%)' })
  tasaRtefte: number;

  @ApiProperty({ example: 0.15, description: 'Retención de IVA (fracción, sobre el IVA)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'RteIVA: máximo 6 decimales' })
  @Min(0, { message: 'RteIVA no puede ser negativa' })
  @Max(0.999999, { message: 'RteIVA debe ser una fracción (0.15 = 15%)' })
  tasaRteiva: number;

  @ApiProperty({ example: 0.00966, description: 'Retención de ICA (fracción)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'RteICA: máximo 6 decimales' })
  @Min(0, { message: 'RteICA no puede ser negativa' })
  @Max(0.999999, { message: 'RteICA debe ser una fracción (0.00966 = 0,966%)' })
  tasaRteica: number;
}
