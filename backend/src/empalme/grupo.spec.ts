import { costoExcesoGrupo, liquidarPeriodo, TasasBase } from './empalme';
import type { ContratoTarifario, GrupoTarifario, ItemTarifario } from './tarifario-csv';
import type { VolumenesPeriodo } from './volumenes-bigquery';

const TASAS: TasasBase = { iva: 0.19, rtefte: 0.035, rteica: 0, rteiva: 0.15, autorretencion: 0.008 };
const TRAMOS = [
  { volumenDesde: 250001, volumenHasta: 350000, precioUnitario: 88.46 },
  { volumenDesde: 350001, volumenHasta: 500000, precioUnitario: 59.31 },
  { volumenDesde: 500001, volumenHasta: 700000, precioUnitario: 48.7 },
];
const GRUPO: GrupoTarifario = { codigo: 'OSPEDALE', umbral: 1000, escalonesPorAnio: { 2026: [{ volumenDesde: 1, volumenHasta: 1500, precioUnitario: 100 }, { volumenDesde: 1501, volumenHasta: 99999, precioUnitario: 50 }] } };

function miembro(nit: string, minimo: number, tope: number, grupo: GrupoTarifario): ContratoTarifario {
  const item: ItemTarifario = {
    servicios: ['iFactura-Emision'], modeloCobro: 'minimo_garantizado', moneda: 'COP',
    tarifasPorAnio: { 2026: { escalones: [], valorMinimo: minimo, volumenTopeMinimo: tope } },
  };
  return {
    contratoId: `${nit}-FACTURA-2026`, nit, razonSocial: nit, segmento: 'CORPORATIVO', vigenciaDesde: '2026-01-01', vigenciaHasta: null,
    moneda: 'COP', perfil: { rtefte: 0.035, rteiva: 0.15, rteica: 0 }, items: [item], grupo,
  };
}
const vol = (m: Record<string, number>): VolumenesPeriodo =>
  ({ periodo: '2026-09', porNit: new Map(Object.entries(m).map(([n, c]) => [n, new Map([['iFactura-Emision', c]])])) } as VolumenesPeriodo);

describe('contrato de grupo', () => {
  it('costoExcesoGrupo valora cada posición al precio de su tramo (escalonado)', () => {
    // umbral 263.250, exceso 100.000 → posiciones 263.251–363.250: 86.750 a 88,46 y 13.250 a 59,31
    expect(costoExcesoGrupo(263250, 100000, TRAMOS).toNumber()).toBeCloseTo(86750 * 88.46 + 13250 * 59.31, 2);
  });

  it('bajo el umbral solo se cobran los mínimos, aunque un NIT pase su tope', () => {
    const cs = [miembro('A', 1000, 400, GRUPO), miembro('B', 2000, 600, GRUPO)];
    const r = liquidarPeriodo(cs, vol({ A: 450, B: 300 }), TASAS);
    expect(r.errores).toEqual([]);
    expect(r.liquidaciones.map((l) => l.resultado.subtotal)).toEqual([1000, 2000]);
  });

  it('sobre el umbral el exceso va a los NIT que pasaron su tope, en proporción', () => {
    const cs = [miembro('A', 1000, 400, GRUPO), miembro('B', 2000, 600, GRUPO)];
    // total 1.300 → exceso 300 a $100 = 30.000; A se pasó 300 (450−150?) → A=700 vs tope 400: pasó 300; B=600 vs 600: 0
    const r = liquidarPeriodo(cs, vol({ A: 700, B: 600 }), TASAS);
    const [a, b] = r.liquidaciones;
    expect(a.resultado.subtotal).toBe(1000 + 30000);
    expect(b.resultado.subtotal).toBe(2000);
    expect(a.anomalias).toContain('exceso_grupo:OSPEDALE');
  });

  it('reparte entre dos NIT y la suma da exactamente el costo del grupo', () => {
    const cs = [miembro('A', 1000, 400, GRUPO), miembro('B', 2000, 600, GRUPO), miembro('C', 500, 100, GRUPO)];
    // total 1.600 → exceso 600: 500 a 100 + 100 a 50 = 55.000; excesos propios A 300, B 100, C 0
    const r = liquidarPeriodo(cs, vol({ A: 700, B: 700, C: 200 }), TASAS);
    const cobro = r.liquidaciones.map((l) => l.resultado.subtotal - (l.nit === 'A' ? 1000 : l.nit === 'B' ? 2000 : 500));
    expect(cobro.reduce((s, x) => s + x, 0)).toBeCloseTo(55000 + 0, 0);
  });
});
