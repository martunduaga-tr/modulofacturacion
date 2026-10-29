import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMITE_CLAVE_TEMPORAL_KEY } from '../decorators/clave-temporal.decorator';
import { AuthUser } from '../../common/decorators/current-user.decorator';

/** Código que el frontend reconoce para llevar al usuario a cambiar su clave temporal. */
export const DEBE_CAMBIAR_CLAVE = 'DEBE_CAMBIAR_CLAVE';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = (key: string) => this.reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()]);
    if (meta(IS_PUBLIC_KEY)) {
      return true;
    }
    const ok = (await super.canActivate(context)) as boolean;
    // Con clave temporal solo se puede cambiar la clave: nada se aprueba ni se edita a su nombre.
    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (ok && user?.debeCambiarClave && !meta(PERMITE_CLAVE_TEMPORAL_KEY)) {
      throw new ForbiddenException({ statusCode: 403, code: DEBE_CAMBIAR_CLAVE, message: 'Debe cambiar su clave temporal antes de continuar' });
    }
    return ok;
  }
}
