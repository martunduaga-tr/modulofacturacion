import type { Clasificador } from '../clientes/entities/comentario-factura.entity';

/**
 * Archivo de cobros para que Contabilidad digite (o cargue) las facturas en iFactura.
 * CSV con `;` y coma decimal: así lo abre Excel en español sin pasos extra. UTF-8 con BOM
 * para que las tildes salgan bien.
 */
const BOM = String.fromCharCode(0xfeff);

/** La "hoja" de Contabilidad a la que pertenece el cobro (el clasificador de la línea de factura). */
export function clasificadorDe(servicios: string[]): Clasificador | null {
  const s = servicios.map((x) => x.toLowerCase());
  const tiene = (prefijo: string) => s.some((x) => x.startsWith(prefijo));
  if (tiene('ifactura-emision') && tiene('ifactura-recepcion')) return 'Emisión - Recepción';
  if (tiene('ifactura-emision')) return 'Emisión';
  if (tiene('ifactura-recepcion')) return 'Recepción';
  if (tiene('ifactura-nomina')) return 'Nómina';
  if (tiene('ifactura-docsoporte')) return 'Doc Soporte';
  if (tiene('idocumentos')) return 'iDocumentos';
  if (tiene('isalud')) return 'ISALUD';
  if (tiene('isoat')) return 'iSoat';
  if (tiene('iseguros')) return 'iSeguros';
  if (tiene('irecaudo')) return 'iRecaudo';
  return null;
}

/** "Clasificador - comentario" (lo acordado con Contabilidad); sin comentario, solo el clasificador. */
export function descripcionLinea(servicios: string[], comentario: string | null | undefined): string {
  const base = clasificadorDe(servicios) ?? servicios.join(' + ');
  return comentario?.trim() ? `${base} - ${comentario.trim()}` : base;
}

export interface FilaExportacion {
  periodo: string;
  estado: string;
  nit: string;
  razonSocial: string;
  servicios: string[];
  comentario: string | null;
  cantidad: number;
  moneda: string;
  subtotal: number;
  iva: number;
  total: number;
  rtefte: number;
  rteiva: number;
  rteica: number;
  valorCartera: number;
  trm: number | null;
  fechaFactura: string | null;
  aprobo: string | null;
}

export const COLUMNAS = [
  'Periodo', 'Estado', 'NIT', 'Razón social', 'Clasificador', 'Servicio', 'Descripción de la línea', 'Cantidad', 'Moneda',
  'Subtotal', 'IVA', 'Total factura', 'RteFte', 'RteIVA', 'ReteICA', 'Valor a recaudar', 'TRM', 'Fecha factura', 'Aprobó',
];

/** Número con coma decimal y sin separador de miles (Excel es-CO lo toma como número). */
function num(v: number | null, decimales = 2): string {
  if (v == null) return '';
  const r = Math.round(v * 10 ** decimales) / 10 ** decimales;
  return (Number.isInteger(r) ? String(r) : r.toFixed(decimales)).replace('.', ',');
}

function celda(v: string): string {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function generarCsv(filas: FilaExportacion[]): string {
  const lineas = [COLUMNAS.join(';')];
  for (const f of filas) {
    lineas.push(
      [
        f.periodo, f.estado, f.nit, f.razonSocial, clasificadorDe(f.servicios) ?? '', f.servicios.join(' + '),
        descripcionLinea(f.servicios, f.comentario), String(f.cantidad), f.moneda,
        num(f.subtotal), num(f.iva), num(f.total), num(f.rtefte), num(f.rteiva), num(f.rteica), num(f.valorCartera),
        num(f.trm, 2), f.fechaFactura ?? '', f.aprobo ?? '',
      ]
        .map(celda)
        .join(';'),
    );
  }
  return BOM + lineas.join('\r\n') + '\r\n';
}
