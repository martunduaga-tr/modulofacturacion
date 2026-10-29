/** Fecha de hoy (AAAA-MM-DD) en Colombia, sin importar la zona horaria del servidor. */
export function hoyColombia(ahora = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}
