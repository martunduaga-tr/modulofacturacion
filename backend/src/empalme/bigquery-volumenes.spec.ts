import { readFileSync } from 'fs';
import { join } from 'path';
import { ServiceUnavailableException } from '@nestjs/common';
import { decodificar, parsearCsv } from './csv';
import { leerTarifarioCsv } from './tarifario-csv';
import { leerVolumenesCsv } from './volumenes-bigquery';
import { liquidarPeriodo, TasasBase } from './empalme';
import {
  BigQueryVolumenesService,
  ClienteBigQuery,
  consultaPorDefecto,
  periodoAnterior,
  rangoPeriodo,
  VISTA_POR_DEFECTO,
} from './bigquery-volumenes.service';
import { EmpalmeProgramadoService } from './empalme-programado.service';
import type { EmpalmeService } from './empalme.service';
import type { SchedulerRegistry } from '@nestjs/schedule';

const fixture = (archivo: string) => decodificar(readFileSync(join(__dirname, '__fixtures__', archivo)));
const TASAS_BASE: TasasBase = { iva: 0.19, rtefte: 0.035, rteica: 0.00966, rteiva: 0.15, autorretencion: 0.008 };

/**
 * Simula BigQuery ejecutando la consulta por defecto sobre el export de julio:
 * GROUP BY Fecha, NIT, Servicio con positivos y negativos separados. Como hace
 * el cliente oficial, devuelve la fecha como { value } (tipo DATE).
 */
function clienteSimulado(csv: string): ClienteBigQuery & { llamadas: { query: string; params: Record<string, string> }[] } {
  const llamadas: { query: string; params: Record<string, string> }[] = [];
  return {
    llamadas,
    async query({ query, params }) {
      llamadas.push({ query, params });
      const grupos = new Map<string, { Fecha: { value: string }; NIT: string; Servicio: string; Cantidad: number; Negativos: number }>();
      for (const r of parsearCsv(csv, ',')) {
        if (r.Fecha < params.desde || r.Fecha > params.hasta) continue;
        const k = `${r.Fecha}|${r.NIT}|${r.Servicio}`;
        const g = grupos.get(k) ?? { Fecha: { value: r.Fecha }, NIT: r.NIT, Servicio: r.Servicio, Cantidad: 0, Negativos: 0 };
        const n = Number(r.Cantidad);
        if (n >= 0) g.Cantidad += n;
        else g.Negativos += n;
        grupos.set(k, g);
      }
      return [[...grupos.values()]];
    },
  };
}

const csvJulio = fixture('bigquery_piloto_2026-07.csv');
const contratos = leerTarifarioCsv(fixture('tarifario_piloto.csv')).contratos;

describe('BigQueryVolumenesService', () => {
  it('consulta directa = mismo resultado que el CSV descargado (las 8 facturas de julio)', async () => {
    const cliente = clienteSimulado(csvJulio);
    const desdeBq = await new BigQueryVolumenesService(cliente).volumenes('2026-07');
    const desdeCsv = leerVolumenesCsv(csvJulio, '2026-07');

    expect(desdeBq.porNit).toEqual(desdeCsv.porNit);
    const total = (r: ReturnType<typeof liquidarPeriodo>) => r.liquidaciones.map((l) => [l.nit, l.servicios.join('+'), l.resultado.factura.total]);
    expect(total(liquidarPeriodo(contratos, desdeBq, TASAS_BASE))).toEqual(total(liquidarPeriodo(contratos, desdeCsv, TASAS_BASE)));
  });

  it('pide exactamente el mes: parámetros @desde/@hasta, sin interpolar fechas en el SQL', async () => {
    const cliente = clienteSimulado(csvJulio);
    await new BigQueryVolumenesService(cliente).volumenes('2026-07');
    expect(cliente.llamadas[0].params).toEqual({ desde: '2026-07-01', hasta: '2026-07-31' });
    expect(cliente.llamadas[0].query).toContain(VISTA_POR_DEFECTO);
    expect(cliente.llamadas[0].query).not.toContain('2026-07');
  });

  it('conserva los ajustes negativos aunque la consulta agregue por día', async () => {
    const cliente: ClienteBigQuery = {
      query: async () => [[{ Fecha: '2026-07-12', NIT: 900482242, Servicio: 'iFactura-Emision', Cantidad: 500, Negativos: -130 }]],
    };
    const v = await new BigQueryVolumenesService(cliente).volumenes('2026-07');
    expect(v.porNit.get('900482242')!.get('iFactura-Emision')).toBe(370);
    expect(v.ajustesNegativos).toEqual([{ fecha: '2026-07-12', nit: '900482242', servicio: 'iFactura-Emision', cantidad: -130 }]);
  });

  it('sin credencial: error claro que remite al CSV, nunca un mes en cero', async () => {
    const s = new BigQueryVolumenesService(null);
    expect(s.estado().configurado).toBe(false);
    await expect(s.volumenes('2026-07')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rechaza cantidades no enteras en vez de redondearlas', async () => {
    const cliente: ClienteBigQuery = { query: async () => [[{ Fecha: '2026-07-01', NIT: '1', Servicio: 'x', Cantidad: 2.5 }]] };
    await expect(new BigQueryVolumenesService(cliente).volumenes('2026-07')).rejects.toThrow('no entero');
  });

  it('la consulta por defecto no permite inyectar SQL por el nombre de la vista', () => {
    expect(consultaPorDefecto('a`; DROP TABLE x; --')).not.toContain('`;');
  });
});

describe('Fechas del periodo', () => {
  it('rango del mes, incluido febrero bisiesto', () => {
    expect(rangoPeriodo('2026-02')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(rangoPeriodo('2028-02')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    expect(rangoPeriodo('2026-12')).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' });
  });

  it('la liquidación programada toma el mes cerrado anterior (enero → diciembre del año pasado)', () => {
    expect(periodoAnterior(new Date(2026, 7, 3))).toBe('2026-07');
    expect(periodoAnterior(new Date(2027, 0, 3))).toBe('2026-12');
  });
});

describe('EmpalmeProgramadoService', () => {
  const programado = (empalme: Partial<EmpalmeService>) =>
    new EmpalmeProgramadoService(empalme as EmpalmeService, {} as SchedulerRegistry);

  it('liquida el mes anterior por BigQuery, marcado como programado', async () => {
    const liquidarBigQuery = jest.fn().mockResolvedValue({ liquidados: 8, bloqueados: 0, pendientes: {} });
    await programado({ liquidarBigQuery }).ejecutar(new Date(2026, 7, 3));
    expect(liquidarBigQuery).toHaveBeenCalledWith('2026-07', 'sistema (programado)', 'bigquery_programado');
  });

  it('si BigQuery falla, no tumba la app ni reintenta solo', async () => {
    const liquidarBigQuery = jest.fn().mockRejectedValue(new Error('timeout'));
    await expect(programado({ liquidarBigQuery }).ejecutar(new Date(2026, 7, 3))).resolves.toBeUndefined();
    expect(liquidarBigQuery).toHaveBeenCalledTimes(1);
  });

  it('sin EMPALME_AUTOMATICO=true no programa nada', () => {
    const estadoBigQuery = jest.fn();
    delete process.env.EMPALME_AUTOMATICO;
    programado({ estadoBigQuery }).onModuleInit();
    expect(estadoBigQuery).not.toHaveBeenCalled();
  });
});
