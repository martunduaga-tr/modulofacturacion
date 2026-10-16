import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsuariosService } from './usuarios.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string; usuario: { username: string; nombre: string; rol: string } }> {
    const usuario = await this.usuariosService.findByUsernameConHash(dto.username.trim());
    if (!usuario || usuario.estado !== 'activo') {
      throw new UnauthorizedException('Usuario o contraseña inválidos');
    }
    const passwordOk = await bcrypt.compare(dto.password, usuario.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Usuario o contraseña inválidos');
    }
    const payload = { sub: usuario.id, username: usuario.username, rol: usuario.rol };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      usuario: { username: usuario.username, nombre: usuario.nombre, rol: usuario.rol },
    };
  }
}
