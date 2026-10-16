import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { IsDateString } from 'class-validator';

export class UpdateParametroDto {
  @ApiProperty({ example: 0.19, description: 'Valor del parámetro (fracción para tasas, ej. 0.19 = 19%)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'valor debe ser numérico (hasta 6 decimales)' })
  @Min(0, { message: 'valor no puede ser negativo' })
  valor: number;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Vigencia desde (YYYY-MM-DD). Si se omite, se usa la fecha de hoy.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'vigenciaDesde debe ser una fecha YYYY-MM-DD' })
  vigenciaDesde?: string;
}
