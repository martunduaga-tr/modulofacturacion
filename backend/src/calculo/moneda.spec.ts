import { aPesos } from './moneda';
import { MotorCalculoService } from './motor-calculo.service';
import { liquidarPeriodo, TasasBase } from '../empalme/empalme';
import { leerTarifarioCsv } from '../empalme/tarifario-csv';
import { leerVolumenesCsv } from '../empalme/volumenes-bigquery';
import { TrmService } from '../parametros/trm.service';

const TASAS: TasasBase = { iva: 0.19, rtefte: 0.035, rteica: 0, rteiva: 0.15, autorretencion: 0.008 };
const ENCABEZADO = 'nit;razon_social;segmento;contrato_id;vigencia_desde;moneda;anio;servicios;volumen;modelo;desde;hasta;valor;periodicidad;rtefte;rteiva;rteica';
// Seguros del Estado, iSeguros - Emisión: un cobro en COP y otro en USD sobre las mismas transacciones.
const SDE = [
  ENCABEZADO,
  '860009578;SDE;CORPORATIVO;SDE-2026;2026-01-01;COP;2026;iSeguros - Emisión;CONJUNTO;MINIMO;1;6000;15891540;MENSUAL;0,035;0,15;0',
  '860009578;SDE;CORPORATIVO;SDE-2026;2026-01-01;COP;2026;iSeguros - Emisión;CONJUNTO;ESCALA;6001;;1407;MENSUAL;0,035;0,15;0',
  '860009578;SDE;CORPORATIVO;SDE-2026;2026-01-01;USD;2026;iSeguros - Emisión;CONJUNTO;MINIMO;1;6000;4843,90;MENSUAL;0,035;0,15;0',
  '860009578;SDE;CORPORATIVO;SDE-2026;2026-01-01;USD;2026;iSeguros - Emisión;CONJUNTO;ESCALA;6001;;0,43;MENSUAL;0,035;0,15;0',
].join('\n');
const VOLUMEN = leerVolumenesCsv(['Fecha,NIT,Servicio,SubServicio,Cantidad', '2026-09-01,860009578,iSeguros - Emisión,Cumplimiento,7000'].join('\n'), '2026-09');

describe('Tarifas en USD', () => {
  it('el tarifario acepta el mismo servicio en COP y en USD (dos cobros), pero no dos veces en la misma moneda', () => {
    const { contratos, errores } = leerTarifarioCsv(SDE);
    expect(errores).toEqual([]);
    expect(contratos[0].items.map((i) => [i.servicios[0], i.moneda, i.modeloCobro])).toEqual([
      ['iSeguros - Emisión', 'COP', 'minimo_garantizado'],
      ['iSeguros - Emisión', 'USD', 'minimo_garantizado'],
    ]);
    // Las dos tablas en COP: el contrato se rechaza (no se cobra dos veces lo mismo en la misma moneda).
    const enCop = leerTarifarioCsv(SDE.replace(';USD;', ';COP;').replace(';USD;', ';COP;'));
    expect(enCop.contratos).toEqual([]);
    expect(enCop.errores).toHaveLength(1);
  });

  it('las mismas transacciones alimentan los dos cobros; el USD sale en dólares', () => {
    const r = liquidarPeriodo(leerTarifarioCsv(SDE).contratos, VOLUMEN, TASAS);
    expect(r.noEmpalmados).toEqual([]);
    const porMoneda = Object.fromEntries(r.liquidaciones.map((l) => [l.moneda, l.resultado]));
    expect(porMoneda.COP.volumen).toBe(7000);
    expect(porMoneda.COP.subtotal).toBe(15891540 + 1000 * 1407);
    expect(porMoneda.USD.volumen).toBe(7000);
    expect(porMoneda.USD.subtotal).toBe(4843.9 + 1000 * 0.43); // 5273,90 USD
  });

  it('a pesos: subtotal USD × TRM y desde ahí IVA y retenciones como un cobro en COP', () => {
    const usd = liquidarPeriodo(leerTarifarioCsv(SDE).contratos, VOLUMEN, TASAS).liquidaciones.find((l) => l.moneda === 'USD')!.resultado;
    const cop = aPesos(usd, 3157.94);
    expect(cop.subtotal).toBe(16654659.77); // 5.273,90 × 3.157,94 = 16.654.659,766 → 2 decimales
    expect(cop.iva.valor).toBe(3164385.36);
    expect(cop.rtefte.valor).toBe(582913.09);
    expect(cop.factura).toMatchObject({ subtotal: 16654660, iva: 3164385, total: 19819045 });
    expect(cop.modeloCobro).toBe('minimo_garantizado'); // trazabilidad: modelo y volumen de la tarifa en USD
    expect(cop.volumen).toBe(7000);
    expect(cop.tarifaUnitaria).toBe(usd.tarifaUnitaria);
    // Mismo resultado que calcular en pesos un fijo igual al subtotal convertido.
    expect(cop.valorCartera).toBe(new MotorCalculoService().calcular({ modeloCobro: 'fijo_mensual', volumen: 7000, anioTarifa: 2026, tarifa: { valorFijo: 16654659.77 }, tasas: TASAS }).valorCartera);
  });
});

describe('TRM', () => {
  const guardadas = new Map<string, { fecha: string; valor: number; fuente: string; usuario: string | null }>();
  const repo = {
    findOne: jest.fn(async ({ where }) => {
      if (typeof where.fecha === 'string') return guardadas.get(where.fecha) ?? null;
      const tope = where.fecha.value as string; // LessThanOrEqual
      return [...guardadas.values()].filter((t) => t.fecha <= tope).sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null;
    }),
    create: jest.fn((o) => ({ ...o })),
    merge: jest.fn((a, b) => Object.assign(a, b)),
    save: jest.fn(async (o) => { guardadas.set(o.fecha, o); return o; }),
  };
  const auditoria = { registrar: jest.fn() };
  const consulta = jest.fn(async (fecha: string) => (fecha === '2026-10-27' ? 3157.94 : null));
  const trm = new TrmService(repo as never, auditoria as never, consulta);

  it('consulta la oficial una vez y la guarda; la digitada por Contabilidad manda y queda en auditoría', async () => {
    expect((await trm.deFecha('2026-10-27')).valor).toBe(3157.94);
    expect((await trm.deFecha('2026-10-27')).fuente).toBe('datos.gov.co');
    expect(consulta).toHaveBeenCalledTimes(1);

    await trm.registrarManual('2026-10-27', 3160, 'contabilidad');
    expect((await trm.deFecha('2026-10-27')).valor).toBe(3160);
    expect(auditoria.registrar).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'UPDATE', valorAnterior: { valor: 3157.94, fuente: 'datos.gov.co' }, valorNuevo: { fecha: '2026-10-27', valor: 3160, fuente: 'manual' },
    }));
  });

  it('fecha sin TRM publicada: error para digitarla; para estimar usa la última guardada', async () => {
    await expect(trm.deFecha('2026-12-31')).rejects.toThrow('Digítela a mano');
    expect((await trm.estimada('2026-12-31'))!.valor).toBe(3160);
  });
});
