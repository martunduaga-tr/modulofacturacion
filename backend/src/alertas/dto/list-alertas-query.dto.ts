import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import type { SeveridadAlerta, TipoAlerta } from '../alertas.types';

const TIPOS: TipoAlerta[] = [
  'desactualizado',
  'tarifa_incompleta',
  'nit_pendiente',
  'volumen_sin_enlazar',
  'vencido',
  'por_vencer',
  'caida_general',
  'variacion_diaria',
  'variacion_mensual',
];
const SEVERIDADES: SeveridadAlerta[] = ['critica', 'alta', 'media'];

export class ListAlertasQueryDto {
  @ApiPropertyOptional({ enum: TIPOS })
  @IsOptional()
  @IsIn(TIPOS)
  tipo?: TipoAlerta;

  @ApiPropertyOptional({ enum: SEVERIDADES })
  @IsOptional()
  @IsIn(SEVERIDADES)
  severidad?: SeveridadAlerta;

  @ApiPropertyOptional({ description: 'true = incluir las alertas de variación ya revisadas por Contabilidad' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  incluirRevisadas?: boolean;
}
