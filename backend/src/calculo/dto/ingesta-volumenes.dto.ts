import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class VolumenItemDto {
  @ApiProperty({ example: '860002184' })
  @IsString()
  @IsNotEmpty()
  nit: string;

  @ApiProperty({ example: 'IFACTURA' })
  @IsString()
  @IsNotEmpty()
  productoCodigo: string;

  @ApiProperty({ example: 'EMISION' })
  @IsString()
  @IsNotEmpty()
  conceptoCodigo: string;

  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio: number;

  @ApiProperty({ example: 1, description: 'Mes 1..12' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes: number;

  @ApiProperty({ example: 243936 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cantidad: number;

  @ApiPropertyOptional({ example: 'MATRIZ ENERO 26' })
  @IsOptional()
  @IsString()
  origen?: string;
}

export class IngestaVolumenesDto {
  @ApiProperty({ type: [VolumenItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VolumenItemDto)
  items: VolumenItemDto[];
}
