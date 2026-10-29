import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { agruparVolumenes, FilaVolumen, OpcionesVolumen, VolumenesPeriodo } from './volumenes-bigquery';

/**
 * Consulta directa a BigQuery (vista de Data) para el empalme: reemplaza
 * descargar y subir el CSV. El resultado es el mismo VolumenesPeriodo que
 * produce el CSV, así que el empalme y el motor no cambian.
 *
 * Configuración (variables de entorno):
 *   BQ_CREDENCIALES_JSON  contenido del JSON de la cuenta de servicio (Railway), o
 *   GOOGLE_APPLICATION_CREDENTIALS  ruta al JSON (local)
 *   BQ_PROYECTO   proyecto que factura la consulta (default: el de la cuenta de servicio)
 *   BQ_VISTA      tabla/vista con Fecha, NIT, Servicio, SubServicio, Cantidad
 *   BQ_CONSULTA   (opcional) el SQL exacto que entregue Data; debe recibir @desde y
 *                 @hasta (AAAA-MM-DD) y devolver Fecha, NIT, Servicio, Cantidad
 *                 (SubServicio opcional: sin él todo empalma por servicio completo).
 *
 * La cuenta debe ser de la aplicación y SOLO de lectura (no una llave personal).
 */

export const BIGQUERY_CLIENTE = 'BIGQUERY_CLIENTE';

/** Lo mínimo que se usa del cliente oficial (@google-cloud/bigquery), para poder simularlo en pruebas. */
export interface ClienteBigQuery {
  query(opciones: { query: string; params: Record<string, string>; location?: string }): Promise<[Record<string, unknown>[], ...unknown[]]>;
}

export const VISTA_POR_DEFECTO = 'transfiriendocolombia.Monitoreo_Transacciones.Final_View-Consolidate';

/**
 * Agrega por día + NIT + servicio + subservicio en BigQuery (de ~64 mil filas a unos miles)
 * sin perder los ajustes negativos de Data: positivos y negativos van en
 * columnas separadas. CAST a STRING porque la vista trae Fecha como texto y
 * NIT puede venir numérico; así la consulta sirve en ambos casos.
 */
export function consultaPorDefecto(vista: string): string {
  return `
    SELECT CAST(Fecha AS STRING) AS Fecha,
           CAST(NIT AS STRING)   AS NIT,
           Servicio,
           IFNULL(CAST(SubServicio AS STRING), '') AS SubServicio,
           SUM(IF(Cantidad >= 0, Cantidad, 0)) AS Cantidad,
           SUM(IF(Cantidad < 0, Cantidad, 0))  AS Negativos
    FROM \`${vista.replace(/`/g, '')}\`
    WHERE CAST(Fecha AS STRING) BETWEEN @desde AND @hasta
    GROUP BY 1, 2, 3, 4`;
}

/** Primer y último día del periodo AAAA-MM. */
export function rangoPeriodo(periodo: string): { desde: string; hasta: string } {
  const [anio, mes] = periodo.split('-').map(Number);
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(ultimo).padStart(2, '0')}` };
}

/** Mes cerrado anterior a una fecha (la liquidación programada corre a comienzos de mes). */
export function periodoAnterior(hoy: Date): string {
  const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function texto(v: unknown): string {
  // El cliente oficial devuelve DATE como objeto { value: 'AAAA-MM-DD' }.
  if (v && typeof v === 'object' && 'value' in v) return String((v as { value: unknown }).value);
  return v == null ? '' : String(v);
}

function entero(v: unknown, campo: string, fila: Record<string, unknown>): number {
  const n = Number(texto(v) || 0);
  if (!Number.isInteger(n)) throw new Error(`BigQuery devolvió ${campo} no entero (${texto(v)}) para NIT ${texto(fila.NIT)}`);
  return n;
}

@Injectable()
export class BigQueryVolumenesService {
  private readonly vista = process.env.BQ_VISTA || VISTA_POR_DEFECTO;
  private readonly consulta = process.env.BQ_CONSULTA || consultaPorDefecto(this.vista);

  constructor(@Optional() @Inject(BIGQUERY_CLIENTE) private readonly cliente: ClienteBigQuery | null) {}

  estado(): { configurado: boolean; vista: string; consultaPropia: boolean } {
    return { configurado: !!this.cliente, vista: this.vista, consultaPropia: !!process.env.BQ_CONSULTA };
  }

  async volumenes(periodo: string, opciones: OpcionesVolumen = {}): Promise<VolumenesPeriodo> {
    if (!this.cliente) {
      throw new ServiceUnavailableException(
        'BigQuery no está configurado (falta la cuenta de servicio de Data). Use la carga del CSV mientras tanto.',
      );
    }
    const [filas] = await this.cliente.query({ query: this.consulta, params: rangoPeriodo(periodo) });

    const registros: FilaVolumen[] = [];
    for (const f of filas) {
      const base = { fecha: texto(f.Fecha), nit: texto(f.NIT), servicio: texto(f.Servicio), subservicio: texto(f.SubServicio) };
      registros.push({ ...base, cantidad: entero(f.Cantidad, 'Cantidad', f) });
      // Columna presente con la consulta por defecto; una BQ_CONSULTA propia puede traer los negativos en Cantidad.
      const negativos = f.Negativos == null ? 0 : entero(f.Negativos, 'Negativos', f);
      if (negativos !== 0) registros.push({ ...base, cantidad: negativos });
    }
    return agruparVolumenes(registros, periodo, opciones);
  }
}

/** Crea el cliente oficial si hay credenciales; si no, null (la app funciona con CSV). */
export function crearClienteBigQuery(): ClienteBigQuery | null {
  const json = process.env.BQ_CREDENCIALES_JSON;
  if (!json && !process.env.GOOGLE_APPLICATION_CREDENTIALS) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BigQuery } = require('@google-cloud/bigquery') as typeof import('@google-cloud/bigquery');
  const credentials = json ? JSON.parse(json) : undefined;
  return new BigQuery({
    projectId: process.env.BQ_PROYECTO || credentials?.project_id,
    credentials,
  }) as unknown as ClienteBigQuery;
}
