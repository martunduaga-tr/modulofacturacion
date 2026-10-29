/**
 * Liquida un periodo sin base de datos: tarifario CSV + volúmenes de BigQuery
 * (CSV exportado) → empalme + motor → CSV de resultado.
 *
 * Uso:
 *   npx ts-node scripts/liquidar-periodo.ts --periodo 2026-07 \
 *     --tarifario ../../Formato_Tarifario_Carga_Inicial.csv \
 *     --bigquery ../../bq-results-20261016-201621-1792181800403.csv \
 *     --salida ../../Liquidacion_2026-07.csv
 */
import { readFileSync, writeFileSync } from 'fs';
import { decodificar } from '../src/empalme/csv';
import { leerTarifarioCsv } from '../src/empalme/tarifario-csv';
import { leerVolumenesCsv } from '../src/empalme/volumenes-bigquery';
import { liquidarPeriodo } from '../src/empalme/empalme';

function arg(nombre: string): string {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Falta --${nombre}`);
  return process.argv[i + 1];
}

const periodo = arg('periodo');
const { contratos, errores } = leerTarifarioCsv(decodificar(readFileSync(arg('tarifario'))));
const volumenes = leerVolumenesCsv(decodificar(readFileSync(arg('bigquery'))), periodo);
// parametros_globales (02_seed.sql). El perfil de cada contrato reemplaza las retenciones.
const r = liquidarPeriodo(contratos, volumenes, { iva: 0.19, rtefte: 0.035, rteica: 0.00966, rteiva: 0.15, autorretencion: 0.008 });

const sep = ';';
const lineas = [
  ['estado', 'nit', 'cliente', 'contrato', 'servicios', 'volumen', 'subtotal', 'iva', 'total', 'rtefte', 'rteiva', 'rteica', 'cartera', 'detalle'].join(sep),
  ...r.liquidaciones.map((l) =>
    [
      'LIQUIDADO', l.nit, l.razonSocial, l.contratoId, l.servicios.join('+'), l.resultado.volumen,
      l.resultado.factura.subtotal, l.resultado.factura.iva, l.resultado.factura.total,
      l.resultado.rtefte.valor, l.resultado.rteiva.valor, l.resultado.rteica.valor, l.resultado.factura.valorCartera,
      l.anomalias.join(','),
    ].join(sep),
  ),
  ...r.noEmpalmados.map((n) => [n.motivo, n.nit, '', '', n.servicio, n.cantidad, '', '', '', '', '', '', '', ''].join(sep)),
  ...r.errores.map((e) => ['ERROR_CALCULO', e.nit, '', e.contratoId, e.servicios.join('+'), '', '', '', '', '', '', '', '', e.motivo].join(sep)),
];
writeFileSync(arg('salida'), '﻿' + lineas.join('\n'), 'utf-8');

const totalVol = [...volumenes.porNit.values()].flatMap((m) => [...m.values()]).reduce((s, v) => s + v, 0);
const volLiq = r.liquidaciones.reduce((s, l) => s + l.resultado.volumen, 0);
const porMotivo = new Map<string, number>();
for (const n of r.noEmpalmados) porMotivo.set(n.motivo, (porMotivo.get(n.motivo) ?? 0) + n.cantidad);

console.log(`Periodo ${periodo}: ${volumenes.filas} filas de BigQuery, ${volumenes.porNit.size} NIT, ${totalVol} transacciones`);
for (const a of volumenes.ajustesNegativos) console.log(`  ajuste negativo: ${a.fecha} NIT ${a.nit} ${a.servicio} ${a.cantidad}`);
console.log(`Tarifario: ${contratos.length} contratos, ${errores.length} con error`);
for (const e of errores) console.log(`  fila ${e.fila} ${e.contratoId}: ${e.mensaje}`);
console.log(`Liquidados: ${r.liquidaciones.length} items, ${volLiq} transacciones (${((volLiq / totalVol) * 100).toFixed(1)}%)`);
for (const [m, c] of porMotivo) console.log(`  ${m}: ${c} transacciones`);
console.log(`Errores de cálculo: ${r.errores.length}`);
