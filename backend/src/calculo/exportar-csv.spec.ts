import { clasificadorDe, descripcionLinea, FilaExportacion, generarCsv } from './exportar-csv';

const fila = (cambios: Partial<FilaExportacion> = {}): FilaExportacion => ({
  periodo: '2026-09', estado: 'aprobado', nit: '860039988', razonSocial: 'LIBERTY', servicios: ['iFactura-DocSoporte'],
  comentario: null, cantidad: 5077, moneda: 'COP', subtotal: 1775684, iva: 337380, total: 2113064, rtefte: 62148.94,
  rteiva: 50607, rteica: 0, valorCartera: 2000308.07, trm: null, fechaFactura: null, aprobo: 'james', ...cambios,
});

describe('Archivo de cobros (CSV para iFactura)', () => {
  it('clasificador = la hoja de Contabilidad', () => {
    expect(clasificadorDe(['iFactura-Emision', 'iFactura-Recepcion'])).toBe('Emisión - Recepción');
    expect(clasificadorDe(['iFactura-DocSoporte'])).toBe('Doc Soporte');
    expect(clasificadorDe(['iFactura-Nomina'])).toBe('Nómina');
    expect(clasificadorDe(['iSeguros - Emisión/Cumplimiento'])).toBe('iSeguros');
    expect(clasificadorDe(['IRECAUDO_Express'])).toBe('iRecaudo');
    expect(clasificadorDe(['RIPS'])).toBeNull();
  });

  it('descripción: "Clasificador - comentario"; sin comentario, el clasificador; no medido, el servicio', () => {
    expect(descripcionLinea(['iFactura-DocSoporte'], ' ORDEN DE COMPRA 4500 ')).toBe('Doc Soporte - ORDEN DE COMPRA 4500');
    expect(descripcionLinea(['iFactura-DocSoporte'], null)).toBe('Doc Soporte');
    expect(descripcionLinea(['RIPS'], '')).toBe('RIPS');
  });

  it('Excel en español: BOM, ";" y coma decimal sin miles; comillas donde hace falta', () => {
    const csv = generarCsv([fila({ comentario: 'Contrato SG-107; validador "Ana"' })]);
    expect(csv.startsWith('﻿')).toBe(true);
    const [encabezado, linea] = csv.slice(1).split('\r\n');
    expect(encabezado.split(';')).toHaveLength(19);
    expect(linea).toContain(';1775684;337380;2113064;62148,94;50607;0;2000308,07;;');
    expect(linea).toContain(';"Doc Soporte - Contrato SG-107; validador ""Ana""";');
  });
});
