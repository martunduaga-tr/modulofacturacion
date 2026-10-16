import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: number;
  username: string;
  rol: string;
}

/**
 * Devuelve el username del usuario autenticado (puesto por JwtStrategy en
 * request.user). Mientras el guard de auth no esté activo, degrada a 'sistema'
 * para que la auditoría nunca quede sin actor.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    return user?.username ?? 'sistema';
  },
);
