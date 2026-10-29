import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { UsuariosService } from '../usuarios.service';

interface JwtPayload {
  sub: number;
  username: string;
  rol: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usuarios: UsuariosService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'cambiar-este-secreto',
    });
  }

  /**
   * El usuario se lee de la BD en cada petición: un usuario desactivado pierde el acceso
   * de inmediato (no al vencer el token), y el rol y la clave temporal están al día.
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const u = await this.usuarios.findById(payload.sub);
    if (!u || u.estado !== 'activo') throw new UnauthorizedException('Usuario inactivo o inexistente');
    return { id: u.id, username: u.username, rol: u.rol, debeCambiarClave: u.debeCambiarClave };
  }
}
