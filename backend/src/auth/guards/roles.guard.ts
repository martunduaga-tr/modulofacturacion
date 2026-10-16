import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolUsuario } from '../entities/usuario.entity';
import { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequeridos = this.reflector.getAllAndOverride<RolUsuario[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rolesRequeridos || rolesRequeridos.length === 0) {
      return true; // sin @Roles: basta estar autenticado
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user || !rolesRequeridos.includes(user.rol as RolUsuario)) {
      throw new ForbiddenException('No tiene permisos para realizar esta acción');
    }
    return true;
  }
}
