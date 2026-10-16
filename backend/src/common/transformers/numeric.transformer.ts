import { ValueTransformer } from 'typeorm';

/**
 * TypeORM devuelve DECIMAL y BIGINT como string en el driver de SQL Server.
 * Este transformer los convierte a number al leer. Los montos (pesos) y los
 * volúmenes manejados están dentro del rango seguro de JS (< 2^53), por lo que
 * no hay pérdida de precisión en Etapa 1.
 *
 * Nota: el motor de cálculo (Etapa 3) hará la aritmética con precisión decimal
 * controlada; aquí solo exponemos valores legibles para el CRUD.
 */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null): number | null | undefined => value,
  from: (value?: string | null): number | null => (value === null || value === undefined ? null : Number(value)),
};
