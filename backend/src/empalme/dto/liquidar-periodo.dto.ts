import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, Matches } from 'class-validator';

export class LiquidarPeriodoDto {
  @ApiProperty({ example: '2026-07', description: 'Periodo AAAA-MM' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'periodo debe tener formato AAAA-MM (ej. 2026-07)' })
  periodo: string;

  @ApiPropertyOptional({ example: false, description: 'true = no cobrar Hrs_Dev (iSoat) en esta liquidación. Por defecto se cobra.' })
  @IsOptional()
  // Llega como texto en multipart ("true"/"false") y como booleano en JSON.
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean({ message: 'excluirHrsDev debe ser true o false' })
  excluirHrsDev?: boolean;
}
