import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListAuditoriaQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por tabla afectada (ej. tarifa_escalones)' })
  @IsOptional()
  @IsString()
  tabla?: string;

  @ApiPropertyOptional({ description: 'Desde (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'desde debe ser una fecha YYYY-MM-DD' })
  desde?: string;

  @ApiPropertyOptional({ description: 'Hasta (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'hasta debe ser una fecha YYYY-MM-DD' })
  hasta?: string;
}
