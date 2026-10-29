import { leerTarifarioCsv } from './tarifario-csv';
import { agruparVolumenes } from './volumenes-bigquery';
import { liquidarPeriodo, TasasBase } from './empalme';

/**
 * Precisión con montos de millones de pesos: nada de lo que termina en una
 * factura puede pasar por aritmética de punto flotante, y lo que Excel recorta
 * al guardar el CSV se rechaza en vez de cargarse.
 */

const TASAS: TasasBase = { iva: 0.19, rtefte: 0.035, rteica: 0, rteiva: 0, autorretencion: 0.008 };
const ENC = 'nit;razon_social;contrato_id;vigencia_desde;anio;servicios;volumen;modelo;desde;hasta;valor;rtefte;rteiva;rteica';
const fila = (modelo: string, valor: string, desde = '', hasta = '', tasas = '0.035;0;0') =>
  `1;A;C1;2026-01-01;2026;iFactura-Emision;CONJUNTO;${modelo};${desde};${hasta};${valor};${tasas}`;
const leer = (...filas: string[]) => leerTarifarioCsv([ENC, ...filas].join('\n'));

describe('Precisión decimal', () => {
  it('recargos que en float suman 0,02499… se suman exacto (0,025) y redondean bien a 0,03', () => {
    expect(0.0225 + 0.0025).toBe(0.024999999999999998); // el problema existe en JavaScript
    const { contratos, errores } = leer(fila('FIJO', '100'), fila('RECARGO', '0,0225'), fila('RECARGO', '0,0025'));
    expect(errores).toEqual([]);
    const r = liquidarPeriodo(contratos, agruparVolumenes([], '2026-07'), TASAS);
    expect(r.liquidaciones[0].resultado.recargoFijo).toBe(0.03); // en float habría dado 0,02
    expect(r.liquidaciones[0].resultado.subtotal).toBe(100.03);
  });

  it('montos de cientos de millones con decimales se conservan al centavo', () => {
    const { contratos } = leer(fila('FIJO', '398724647,4999'));
    const r = liquidarPeriodo(contratos, agruparVolumenes([], '2026-07'), TASAS).liquidaciones[0].resultado;
    expect(r.subtotal).toBe(398724647.5);
    expect(r.iva.valor).toBe(75757683.03); // 398.724.647,50 × 19% = 75.757.683,025 → 75.757.683,03
    expect(r.factura).toMatchObject({ subtotal: 398724648, iva: 75757683, total: 474482331 });
  });

  it('volumen alto × tarifa con decimales: exacto', () => {
    const { contratos } = leer(fila('ESCALA', '50,904', '1', ''));
    const v = agruparVolumenes([{ fecha: '2026-07-01', nit: '1', servicio: 'iFactura-Emision', cantidad: 12_345_678 }], '2026-07');
    expect(12_345_678 * 50.904).toBe(628444392.9120001); // en float
    expect(liquidarPeriodo(contratos, v, TASAS).liquidaciones[0].resultado.subtotal).toBe(628444392.91); // exacto: 628.444.392,912
  });

  it('escala con recargo y cero transacciones en el mes: cobra solo el recargo (no da error)', () => {
    const { contratos } = leer(fila('ESCALA', '831', '1', '2000'), fila('RECARGO', '1839270'));
    const r = liquidarPeriodo(contratos, agruparVolumenes([], '2026-07'), TASAS);
    expect(r.errores).toEqual([]);
    expect(r.liquidaciones[0].resultado.subtotal).toBe(1839270);
    expect(r.liquidaciones[0].anomalias).toEqual(['volumen_cero']);
  });

  it('rechaza lo que Excel recortó o no cabe sin perder precisión', () => {
    const errores = leer(
      fila('FIJO', '1,23457E+12'),
      fila('FIJO', '1000000000000').replace('C1', 'C2'),
      fila('FIJO', '236,45123').replace('C1', 'C3'),
    ).errores.map((e) => e.mensaje);
    expect(errores).toEqual([
      expect.stringContaining('notación científica'),
      expect.stringContaining('fuera de rango'),
      expect.stringContaining('más de 4 decimales'),
    ]);
  });

  it('tasas con hasta 6 decimales: 0,00966 o 0,966%', () => {
    const r = leer(fila('FIJO', '1', '', '', '0,035;0;0,00966'), fila('FIJO', '1', '', '', '3,5%;0;0,966%').replace('C1', 'C2'));
    expect(r.errores).toEqual([]);
    expect(r.contratos.map((c) => c.perfil.rteica)).toEqual([0.00966, 0.00966]);
  });
});
