import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsuariosService } from './usuarios.service';
import { LoginDto } from './dto/login.dto';
import { Usuario } from './entities/usuario.entity';

export interface Sesion {
  accessToken: string;
  usuario: { username: string; nombre: string; rol: string; debeCambiarClave: boolean };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<Sesion> {
    const usuario = await this.usuariosService.findByUsernameConHash(dto.username.trim());
    if (!usuario || usuario.estado !== 'activo') {
      throw new UnauthorizedException('Usuario o contraseña inválidos');
    }
    const passwordOk = await bcrypt.compare(dto.password, usuario.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Usuario o contraseña inválidos');
    }
    return this.sesion(usuario);
  }

  /** Cambia la clave y devuelve una sesión nueva, ya sin la marca de clave temporal. */
  async cambiarClave(id: number, actual: string, nueva: string): Promise<Sesion> {
    return this.sesion(await this.usuariosService.cambiarClave(id, actual, nueva));
  }

  private async sesion(usuario: Usuario): Promise<Sesion> {
    const payload = { sub: usuario.id, username: usuario.username, rol: usuario.rol };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      usuario: { username: usuario.username, nombre: usuario.nombre, rol: usuario.rol, debeCambiarClave: !!usuario.debeCambiarClave },
    };
  }
}
