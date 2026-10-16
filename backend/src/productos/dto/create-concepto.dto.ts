import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateConceptoDto {
  @ApiProperty({ example: 'EMISION', description: 'Código del concepto, único dentro del producto' })
  @IsString()
  @IsNotEmpty({ message: 'El código es obligatorio' })
  @MaxLength(50)
  codigo: string;

  @ApiProperty({ example: 'Emisión' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(150)
  nombre: string;

  @ApiProperty({ enum: ['activo', 'inactivo'], default: 'activo', required: false })
  @IsOptional()
  @IsIn(['activo', 'inactivo'], { message: "estado debe ser 'activo' o 'inactivo'" })
  estado?: 'activo' | 'inactivo';
}
