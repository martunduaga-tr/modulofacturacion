import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { SeveridadAlerta, TipoAlerta } from '../alertas.types';

const TIPOS: TipoAlerta[] = [
  'desactualizado',
  'tarifa_incompleta',
  'nit_pendiente',
  'volumen_sin_enlazar',
  'vencido',
  'por_vencer',
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
}
