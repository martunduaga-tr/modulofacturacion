import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CambiarClaveDto {
  @ApiProperty({ description: 'Clave actual (la temporal, si el administrador la acaba de asignar)' })
  @IsString()
  @IsNotEmpty({ message: 'Escriba la clave actual' })
  actual: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La clave nueva debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La clave nueva puede tener hasta 72 caracteres' })
  nueva: string;
}

export class RestablecerClaveDto {
  @ApiProperty({ minLength: 8, description: 'Clave temporal: el usuario debe cambiarla al entrar' })
  @IsString()
  @MinLength(8, { message: 'La clave temporal debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La clave temporal puede tener hasta 72 caracteres' })
  password: string;
}

export class EstadoUsuarioDto {
  @ApiProperty({ enum: ['activo', 'inactivo'] })
  @IsIn(['activo', 'inactivo'], { message: "estado debe ser 'activo' o 'inactivo'" })
  estado: 'activo' | 'inactivo';
}
