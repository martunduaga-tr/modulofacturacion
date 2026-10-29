import { SetMetadata } from '@nestjs/common';

export const PERMITE_CLAVE_TEMPORAL_KEY = 'permiteClaveTemporal';

/** Endpoint que un usuario con clave temporal sí puede usar (cambiarla, ver quién es). */
export const PermiteClaveTemporal = () => SetMetadata(PERMITE_CLAVE_TEMPORAL_KEY, true);
