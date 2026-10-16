import { QueryFailedError } from 'typeorm';

/**
 * Números de error de SQL Server para violación de unicidad:
 *  - 2627: violación de constraint UNIQUE / PRIMARY KEY
 *  - 2601: fila con clave duplicada en un índice único
 *
 * Detectar la violación a nivel de BD (en vez de un "buscar-luego-insertar")
 * elimina la condición de carrera: el constraint UNIQUE es la autoridad.
 */
const UNIQUE_ERROR_NUMBERS = new Set([2627, 2601]);

export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = (error as QueryFailedError & { driverError?: { number?: number } }).driverError;
  const number = driverError?.number ?? (error as unknown as { number?: number }).number;
  return number !== undefined && UNIQUE_ERROR_NUMBERS.has(Number(number));
}
