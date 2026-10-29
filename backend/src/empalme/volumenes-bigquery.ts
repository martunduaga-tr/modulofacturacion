import { parsearCsv } from './csv';

/**
 * Volúmenes del periodo desde la consulta de Data (vista Final_View-Consolidate,
 * columnas Fecha, NIT, Servicio, SubServicio, Cantidad).
 *
 * NO se eliminan filas idénticas: Data confirmó que son documentos distintos
 * (Validacion_Consulta_Data_Julio2026.docx); quitarlas deja de cobrar ~90 mil
 * transacciones en julio. La llave de empalme es NIT + Servicio, y
 * NIT + Servicio/SubServicio cuando Data trae subservicio (iDocumentos/ANI,
 * iSeguros - Emisión/Cumplimiento…): ver `llaveVolumen` y empalme.ts.
 *
 * Una fila negativa es un ajuste de Data (julio: -130 y -117 en NIT de Salud CM)
 * y se suma tal cual; solo es error que el TOTAL del mes quede negativo.
 */

/**
 * Hrs_Dev: Data lo registra bajo iSoat - Emision (Seguros del Estado), 44 por día fijos.
 * No está confirmado si se cobra: por defecto entra al volumen y Contabilidad decide en
 * cada liquidación si lo excluye (casilla en Empalme).
 */
export const SUBSERVICIO_HRS_DEV = 'Hrs_Dev';

export interface OpcionesVolumen {
  /** true = Hrs_Dev no se cobra en esta liquidación. */
  excluirHrsDev?: boolean;
}

/** Llave del volumen: "Servicio" o "Servicio/SubServicio". */
export function llaveVolumen(servicio: string, subservicio?: string | null): string {
  const sub = (subservicio ?? '').trim();
  return sub ? `${servicio}/${sub}` : servicio;
}

/** "iDocumentos/ANI" -> "iDocumentos"; sin subservicio queda igual. */
export function servicioDeLlave(llave: string): string {
  const i = llave.indexOf('/');
  return i < 0 ? llave : llave.slice(0, i);
}

export interface FilaVolumen {
  fecha: string;
  nit: string;
  servicio: string;
  subservicio?: string | null;
  cantidad: number;
}

export interface VolumenesPeriodo {
  periodo: string; // AAAA-MM
  /** nit -> llave (Servicio o Servicio/SubServicio, ver llaveVolumen) -> cantidad del mes */
  porNit: Map<string, Map<string, number>>;
  filas: number;
  /** Filas con cantidad negativa (ajustes), para que se vean en el reporte. */
  ajustesNegativos: { fecha: string; nit: string; servicio: string; cantidad: number }[];
  /** Total por día, NIT y servicio (sin subservicio): base de las alertas de variación y la gráfica del cliente. */
  diario: { fecha: string; nit: string; servicio: string; cantidad: number }[];
  /** Transacciones Hrs_Dev del periodo y si se excluyeron del cobro (se ven en el resumen). */
  hrsDev: { cantidad: number; excluido: boolean };
}

export function agruparVolumenes(filas: FilaVolumen[], periodo: string, opciones: OpcionesVolumen = {}): VolumenesPeriodo {
  const porNit = new Map<string, Map<string, number>>();
  const ajustesNegativos: VolumenesPeriodo['ajustesNegativos'] = [];
  const diario = new Map<string, VolumenesPeriodo['diario'][number]>();
  let n = 0;
  let hrsDev = 0;
  for (const f of filas) {
    if (!f.fecha.startsWith(periodo)) continue;
    const nit = f.nit.replace(/\D/g, '');
    if (!nit) continue;
    if ((f.subservicio ?? '').trim() === SUBSERVICIO_HRS_DEV) {
      hrsDev += f.cantidad;
      if (opciones.excluirHrsDev) continue;
    }
    const llave = llaveVolumen(f.servicio, f.subservicio);
    if (f.cantidad < 0) ajustesNegativos.push({ fecha: f.fecha, nit, servicio: llave, cantidad: f.cantidad });
    const servicios = porNit.get(nit) ?? new Map<string, number>();
    servicios.set(llave, (servicios.get(llave) ?? 0) + f.cantidad);
    porNit.set(nit, servicios);
    const fecha = f.fecha.slice(0, 10);
    const clave = `${fecha}|${nit}|${f.servicio}`;
    const d = diario.get(clave) ?? { fecha, nit, servicio: f.servicio, cantidad: 0 };
    d.cantidad += f.cantidad;
    diario.set(clave, d);
    n++;
  }
  for (const [nit, servicios] of porNit) {
    for (const [servicio, cantidad] of servicios) {
      if (cantidad < 0) throw new Error(`Total del mes negativo para NIT ${nit} ${servicio}: ${cantidad}`);
    }
  }
  return { periodo, porNit, filas: n, ajustesNegativos, diario: [...diario.values()], hrsDev: { cantidad: hrsDev, excluido: !!opciones.excluirHrsDev } };
}

/** Filas del export de Data (Fecha, NIT, Servicio, SubServicio, Cantidad), sin agrupar. */
export function leerFilasCsv(texto: string): FilaVolumen[] {
  return parsearCsv(texto, ',').map((r) => {
    const cantidad = Number(r.Cantidad);
    if (r.Cantidad === '' || !Number.isInteger(cantidad)) throw new Error(`Cantidad inválida en NIT ${r.NIT}: "${r.Cantidad}"`);
    return { fecha: r.Fecha, nit: r.NIT, servicio: r.Servicio, subservicio: r.SubServicio ?? '', cantidad };
  });
}

export function leerVolumenesCsv(texto: string, periodo: string, opciones: OpcionesVolumen = {}): VolumenesPeriodo {
  return agruparVolumenes(leerFilasCsv(texto), periodo, opciones);
}
