import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateLineaDto {
  @ApiProperty({ example: 1, description: 'Cliente al que se le factura' })
  @Type(() => Number)
  @IsInt()
  clienteId: number;

  @ApiPropertyOptional({ example: 5, description: 'Item del contrato (Etapa 1) al que corresponde; opcional' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contratoItemId?: number;

  @ApiPropertyOptional({ example: '4155350300' })
  @IsOptional() @IsString() @MaxLength(30)
  cuentaContable?: string;

  @ApiPropertyOptional({ example: 'DOC. ELECTRONICO' })
  @IsOptional() @IsString() @MaxLength(100)
  unidadNegocio?: string;

  @ApiPropertyOptional({ example: 30, description: 'Plazo de pago en días' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  plazoDias?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150)
  recibeFra?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  correoContacto?: string;

  @ApiPropertyOptional({ example: '61' }) @IsOptional() @IsString() @MaxLength(30)
  centroCosto?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  subCentroCosto?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  descCentroCosto?: string;

  @ApiPropertyOptional({ example: 'IFACTURA - Emision' }) @IsOptional() @IsString() @MaxLength(150)
  referencia?: string;

  @ApiPropertyOptional({ example: '0103032' }) @IsOptional() @IsString() @MaxLength(50)
  codIfactura?: string;

  @ApiPropertyOptional({ example: '1' }) @IsOptional() @IsString() @MaxLength(50)
  codSiigo?: string;

  @ApiPropertyOptional({ example: 'Factura Electrónica' }) @IsOptional() @IsString() @MaxLength(150)
  concepto?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  descripcionFactura?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  observaciones?: string;

  @ApiPropertyOptional({ enum: ['activo', 'inactivo'], default: 'activo' })
  @IsOptional() @IsIn(['activo', 'inactivo'])
  estado?: 'activo' | 'inactivo';
}
