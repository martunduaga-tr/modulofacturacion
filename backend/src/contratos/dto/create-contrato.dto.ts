import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateContratoItemDto } from './create-contrato-item.dto';

export class CreateContratoDto {
  @ApiProperty({ example: 1, description: 'ID del cliente' })
  @Type(() => Number)
  @IsInt()
  clienteId: number;

  @ApiProperty({ example: 'Otro Sí No.1 SG-001' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del contrato es obligatorio' })
  @MaxLength(255)
  nombreContrato: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString({}, { message: 'vigenciaDesde debe ser una fecha YYYY-MM-DD' })
  vigenciaDesde?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString({}, { message: 'vigenciaHasta debe ser una fecha YYYY-MM-DD' })
  vigenciaHasta?: string;

  @ApiPropertyOptional({ enum: ['activo', 'inactivo'], default: 'activo' })
  @IsOptional()
  @IsIn(['activo', 'inactivo'])
  estado?: 'activo' | 'inactivo';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observaciones?: string;

  @ApiProperty({ type: [CreateContratoItemDto], description: 'Items del contrato (producto+concepto+tarifas)' })
  @IsArray()
  @ArrayMinSize(1, { message: 'El contrato debe tener al menos un item' })
  @ValidateNested({ each: true })
  @Type(() => CreateContratoItemDto)
  items: CreateContratoItemDto[];
}
