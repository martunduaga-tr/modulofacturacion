import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUsuarioDto {
  @ApiProperty({ example: 'jperez' })
  @IsString()
  @IsNotEmpty({ message: 'El username es obligatorio' })
  @MaxLength(100)
  username: string;

  @ApiProperty({ example: 'Juana Pérez' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(150)
  nombre: string;

  @ApiPropertyOptional({ example: 'jperez@transfiriendo.com' })
  @IsOptional()
  @IsEmail({}, { message: 'El email no es válido' })
  email?: string;

  @ApiProperty({ example: 'Clave123*', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password: string;

  @ApiProperty({ enum: ['administrador', 'editor', 'lector'] })
  @IsIn(['administrador', 'editor', 'lector'], {
    message: "rol debe ser 'administrador', 'editor' o 'lector'",
  })
  rol: 'administrador' | 'editor' | 'lector';
}
