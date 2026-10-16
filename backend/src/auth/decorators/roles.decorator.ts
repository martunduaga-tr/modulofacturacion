import { SetMetadata } from '@nestjs/common';
import { RolUsuario } from '../entities/usuario.entity';

export const ROLES_KEY = 'roles';

/** Restringe un endpoint a los roles indicados. Sin este decorador, basta estar autenticado. */
export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_KEY, roles);
