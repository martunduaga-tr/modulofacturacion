import { readFileSync } from 'fs';
import { join } from 'path';
import type { Contrato } from '../contratos/entities/contrato.entity';
import type { PreLiquidado } from '../calculo/entities/pre-liquidado.entity';
import { decodificar } from './csv';
import { ContratoTarifario, leerTarifarioCsv } from './tarifario-csv';
import { leerVolumenesCsv } from './volumenes-bigquery';
import { Liquidacion, liquidarPeriodo, TasasBase } from './empalme';
import { contratosDesdeBd, planificarGuardado, TarifasDeItemAnio } from './empalme-db';

const fixture = (archivo: string) => decodificar(readFileSync(join(__dirname, '__fixtures__', archivo)));
const TASAS_BASE: TasasBase = { iva: 0.19, rtefte: 0.035, rteica: 0.00966, rteiva: 0.15, autorretencion: 0.008 };

/**
 * Simula lo que EmpalmeService.importarTarifario deja en la BD: entidades con
 * la misma forma que devuelve TypeORM (cliente, items → conceptos → concepto
 * con codigo_data) y las tarifas del año por item.
 */
function comoBd(contratos: ContratoTarifario[], anio: number) {
  const tarifas = new Map<number, TarifasDeItemAnio>();
  let itemId = 0;
  const entidades = contratos.map((c, i) => ({
    id: i + 1,
    codigo: c.contratoId,
    nombreContrato: c.contratoId,
    estado: 'activo',
    segmento: c.segmento,
    vigenciaDesde: c.vigenciaDesde,
    vigenciaHasta: c.vigenciaHasta,
    cliente: {
      id: 100 + i, nit: c.nit, razonSocial: c.razonSocial, estado: 'activo', segmento: c.segmento,
      tasaRtefte: c.perfil.rtefte, tasaRteiva: c.perfil.rteiva, tasaRteica: c.perfil.rteica,
    },
    items: c.items.map((it) => {
      const id = ++itemId;
      const t = it.tarifasPorAnio[anio];
      tarifas.set(id, {
        escalones: t.escalones ?? [],
        minimo: t.valorMinimo != null ? { valorMinimo: t.valorMinimo, volumenTope: t.volumenTopeMinimo ?? null } : null,
        valorFijo: t.valorFijo ?? null,
        recargo: t.recargoFijo ?? 0,
      });
      return { id, estado: 'activo', modeloCobro: it.modeloCobro, conceptos: it.servicios.map((s) => ({ concepto: { codigoData: s } })) };
    }),
  }));
  return { entidades: entidades as unknown as Contrato[], tarifas };
}

const desdeCsv = leerTarifarioCsv(fixture('tarifario_piloto.csv')).contratos;
const volumenes = leerVolumenesCsv(fixture('bigquery_piloto_2026-07.csv'), '2026-07');

describe('contratosDesdeBd: ida y vuelta CSV → BD → empalme', () => {
  const { entidades, tarifas } = comoBd(desdeCsv, 2026);
  const { contratos, sinCodigoData } = contratosDesdeBd(entidades, tarifas, 2026);

  it('el resultado leído desde la BD es idéntico al del CSV (mismas 8 facturas 1:1)', () => {
    const clave = (l: Liquidacion) => `${l.nit}|${l.servicios.join('+')}`;
    const resumen = (ls: Liquidacion[]) => Object.fromEntries(ls.map((l) => [clave(l), l.resultado.factura]));
    const csv = liquidarPeriodo(desdeCsv, volumenes, TASAS_BASE);
    const bd = liquidarPeriodo(contratos, volumenes, TASAS_BASE);
    expect(sinCodigoData).toEqual([]);
    expect(bd.liquidaciones).toHaveLength(8);
    expect(resumen(bd.liquidaciones)).toEqual(resumen(csv.liquidaciones));
    expect(bd.noEmpalmados).toEqual([]);
  });

  it('cada liquidación trae los ids de BD necesarios para guardar el pre-liquidado', () => {
    const bd = liquidarPeriodo(contratos, volumenes, TASAS_BASE);
    expect(bd.liquidaciones.every((l) => l.itemId && l.clienteId)).toBe(true);
  });

  it('cliente retirado, contrato inactivo o item inactivo no entran al empalme', () => {
    const copia = comoBd(desdeCsv, 2026);
    (copia.entidades[0].cliente as { estado: string }).estado = 'retirado';
    (copia.entidades[1] as { estado: string }).estado = 'inactivo';
    (copia.entidades[2].items[0] as { estado: string }).estado = 'inactivo';
    const r = contratosDesdeBd(copia.entidades, copia.tarifas, 2026);
    expect(r.contratos.map((c) => c.contratoId)).not.toContain(desdeCsv[0].contratoId);
    expect(r.contratos.map((c) => c.contratoId)).not.toContain(desdeCsv[1].contratoId);
    expect(r.contratos.find((c) => c.contratoId === desdeCsv[2].contratoId)!.items).toHaveLength(desdeCsv[2].items.length - 1);
  });

  it('un item cuyo servicio no tiene codigo_data se informa, no se ignora en silencio', () => {
    const copia = comoBd(desdeCsv, 2026);
    (copia.entidades[0].items[0].conceptos[0] as { concepto: { codigoData: string | null } }).concepto.codigoData = null;
    expect(contratosDesdeBd(copia.entidades, copia.tarifas, 2026).sinCodigoData).toEqual([
      { contrato: desdeCsv[0].contratoId, itemId: 1 },
    ]);
  });
});

describe('planificarGuardado: el motor nunca sobrescribe lo que aprobó un humano', () => {
  const liq = (itemId: number, total: number) =>
    ({ itemId, contratoId: 'C', resultado: { factura: { total } } }) as unknown as Liquidacion;
  const pre = (id: number, contratoItemId: number, estado: string, totalFactura: number) =>
    ({ id, contratoItemId, estado, totalFactura }) as unknown as PreLiquidado;

  it('escribe nuevos y calculados/rechazados; bloquea aprobados y facturados; avisa si el total cambió', () => {
    const plan = planificarGuardado(
      [pre(1, 10, 'calculado', 100), pre(2, 11, 'rechazado', 100), pre(3, 12, 'aprobado', 100), pre(4, 13, 'facturado', 100)],
      [liq(10, 120), liq(11, 100), liq(12, 150), liq(13, 100), liq(14, 50)],
    );
    expect(plan.escribir.map((e) => [e.liquidacion.itemId, e.existente?.id ?? null])).toEqual([[10, 1], [11, 2], [14, null]]);
    expect(plan.bloqueados.map((b) => [b.existente.id, b.cambio])).toEqual([[3, true], [4, false]]);
    expect(plan.borrar).toEqual([]);
  });

  it('borra solo los "calculado" que ya no se liquidan; los rechazados quedan como evidencia', () => {
    const plan = planificarGuardado([pre(1, 10, 'calculado', 100), pre(2, 11, 'rechazado', 100), pre(3, 12, 'aprobado', 100)], []);
    expect(plan.borrar.map((p) => p.id)).toEqual([1]);
  });
});
