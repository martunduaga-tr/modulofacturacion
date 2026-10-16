import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateClienteDto {
  @ApiProperty({ example: '860002184', description: 'NIT del cliente (único)' })
  @IsString()
  @IsNotEmpty({ message: 'El NIT es obligatorio' })
  @MaxLength(20)
  nit: string;

  @ApiPropertyOptional({ example: '4', description: 'Dígito de verificación del NIT' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,2}$/, { message: 'El DV debe ser numérico (1-2 dígitos)' })
  dv?: string;

  @ApiProperty({ example: 'AXA COLPATRIA SEGUROS S.A.' })
  @IsString()
  @IsNotEmpty({ message: 'La razón social es obligatoria' })
  @MaxLength(255)
  razonSocial: string;

  @ApiPropertyOptional({ example: 'facturacion@axa.com.co' })
  @IsOptional()
  @IsEmail({}, { message: 'El correo de contacto no es válido' })
  @MaxLength(255)
  correoContacto?: string;

  @ApiPropertyOptional({ enum: ['activo', 'retirado'], default: 'activo' })
  @IsOptional()
  @IsIn(['activo', 'retirado'], { message: "estado debe ser 'activo' o 'retirado'" })
  estado?: 'activo' | 'retirado';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observaciones?: string;
}
