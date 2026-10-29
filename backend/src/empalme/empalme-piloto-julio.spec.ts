import { readFileSync } from 'fs';
import { join } from 'path';
import { decodificar } from './csv';
import { leerTarifarioCsv } from './tarifario-csv';
import { agruparVolumenes, leerVolumenesCsv } from './volumenes-bigquery';
import { Liquidacion, liquidarPeriodo, TasasBase } from './empalme';

/**
 * Piloto 1:1 julio 2026: BigQuery (vista de Data) + tarifario de Contabilidad
 * → empalme → motor, contra las facturas electrónicas emitidas (PDF en
 * Contabilidad/facturas). Si una de estas pruebas falla, el sistema calcula
 * distinto de lo que se facturó: no se ajusta el número esperado sin la
 * factura que lo respalde.
 */

const fixture = (archivo: string) => decodificar(readFileSync(join(__dirname, '__fixtures__', archivo)));

// parametros_globales (02_seed.sql); el perfil de cada cliente reemplaza las retenciones.
const TASAS_BASE: TasasBase = { iva: 0.19, rtefte: 0.035, rteica: 0.00966, rteiva: 0.15, autorretencion: 0.008 };

const { contratos, errores } = leerTarifarioCsv(fixture('tarifario_piloto.csv'));
const volumenes = leerVolumenesCsv(fixture('bigquery_piloto_2026-07.csv'), '2026-07');
const julio = liquidarPeriodo(contratos, volumenes, TASAS_BASE);

const buscar = (r: { liquidaciones: Liquidacion[] }, nit: string, servicios: string) =>
  r.liquidaciones.find((l) => l.nit === nit && l.servicios.join('+') === servicios)!;

describe('Tarifario: lectura del formato de carga', () => {
  it('lee los 5 clientes del piloto sin errores', () => {
    expect(errores).toEqual([]);
    expect(new Set(contratos.map((c) => c.nit)).size).toBe(5);
  });

  it('SEPARADO expande Emisión y Recepción de SANTA FE en dos items con la misma tabla', () => {
    const items = contratos.filter((c) => c.nit === '860037950').flatMap((c) => c.items);
    const emision = items.find((i) => i.servicios.join() === 'iFactura-Emision')!;
    const recepcion = items.find((i) => i.servicios.join() === 'iFactura-Recepcion')!;
    expect(emision.tarifasPorAnio[2026].escalones).toEqual(recepcion.tarifasPorAnio[2026].escalones);
  });

  const ENCABEZADO = 'nit;razon_social;contrato_id;vigencia_desde;moneda;anio;servicios;volumen;modelo;desde;hasta;valor;rtefte;rteiva;rteica';

  it('rechaza modelo desconocido, MINIMO sin tope y moneda distinta de COP/USD, sin tumbar el resto del archivo', () => {
    const r = leerTarifarioCsv(
      [
        ENCABEZADO,
        '1;A;C1;2026-01-01;COP;2026;iFactura-Emision;CONJUNTO;ESCALERA;1;;10;0.035;0;0',
        '2;B;C2;2026-01-01;COP;2026;iFactura-Emision;CONJUNTO;MINIMO;1;;500;0.035;0;0',
        '3;C;C3;2026-01-01;EUR;2026;iFactura-Emision;CONJUNTO;ESCALA;1;;0.43;0.035;0;0',
        '4;D;C4;2026-01-01;COP;2026;iFactura-Emision;CONJUNTO;ESCALA;1;;10;0.035;0;0',
        '5;E;C5;2026-01-01;USD;2026;iFactura-Emision;CONJUNTO;ESCALA;1;;0.43;0.035;0;0',
      ].join('\n'),
    );
    expect(r.errores.map((e) => e.contratoId)).toEqual(['C1', 'C2', 'C3']);
    expect(r.contratos.map((c) => [c.contratoId, c.items[0].moneda])).toEqual([['C4', 'COP'], ['C5', 'USD']]);
  });

  it('lee números como los guarda Excel en Colombia (coma decimal) y tasas en porcentaje', () => {
    const r = leerTarifarioCsv(
      [ENCABEZADO, '6;F;C6;2026-01-01;COP;2026;iFactura-Emision;CONJUNTO;ESCALA;1;;236,45;3,5%;15%;0', '7;G;C7;2026-01-01;COP;2026;iFactura-Emision;CONJUNTO;ESCALA;1;;1.508.529,50;0,035;0;0'].join('\n'),
    );
    expect(r.errores).toEqual([]);
    expect(r.contratos[0].items[0].tarifasPorAnio[2026].escalones![0].precioUnitario).toBe(236.45);
    expect(r.contratos[0].perfil).toEqual({ rtefte: 0.035, rteiva: 0.15, rteica: 0 });
    expect(r.contratos[1].items[0].tarifasPorAnio[2026].escalones![0].precioUnitario).toBe(1508529.5);
  });

  it('acepta el CSV separado por comas (Excel con otra configuración regional), con decimales entre comillas', () => {
    const r = leerTarifarioCsv(
      ['nit,razon_social,contrato_id,vigencia_desde,anio,servicios,volumen,modelo,desde,hasta,valor,rtefte,rteiva,rteica', '6,F,C6,2026-01-01,2026,iFactura-Emision,CONJUNTO,ESCALA,1,,"236,45","3,5%",0,0'].join('\n'),
    );
    expect(r.errores).toEqual([]);
    expect(r.contratos[0].items[0].tarifasPorAnio[2026].escalones![0].precioUnitario).toBe(236.45);
    expect(r.contratos[0].perfil.rtefte).toBe(0.035);
  });

  it('retención vacía = la que ya tiene el cliente (se resuelve al cargar); fuera de rango es error', () => {
    const r = leerTarifarioCsv(
      [ENCABEZADO, '8;H;C8;2026-01-01;COP;2026;iFactura-Emision;CONJUNTO;ESCALA;1;;10;0.035;;0', '9;I;C9;2026-01-01;COP;2026;iFactura-Emision;CONJUNTO;ESCALA;1;;10;3.5;0;0'].join('\n'),
    );
    expect(r.contratos.find((c) => c.contratoId === 'C8')!.perfil).toEqual({ rtefte: 0.035, rteiva: null, rteica: 0 });
    expect(r.errores.map((e) => e.mensaje)).toEqual([expect.stringMatching(/^rtefte fuera de rango/)]);
  });

  it('guarda los precios de cada año por separado y liquida con los del año del periodo', () => {
    const r = leerTarifarioCsv(
      [ENCABEZADO, '5;E;C5;2025-01-01;COP;2025;iFactura-Emision;CONJUNTO;ESCALA;1;;100;0.035;0;0', '5;E;C5;2025-01-01;COP;2026;iFactura-Emision;CONJUNTO;ESCALA;1;;105;0.035;0;0'].join('\n'),
    );
    const vol = (periodo: string) => agruparVolumenes([{ fecha: `${periodo}-10`, nit: '5', servicio: 'iFactura-Emision', cantidad: 10 }], periodo);
    expect(liquidarPeriodo(r.contratos, vol('2025-12'), TASAS_BASE).liquidaciones[0].resultado.subtotal).toBe(1000);
    expect(liquidarPeriodo(r.contratos, vol('2026-01'), TASAS_BASE).liquidaciones[0].resultado.subtotal).toBe(1050);
    // Sin precios de 2027 y con consumo: error explícito, no un cobro en cero.
    expect(liquidarPeriodo(r.contratos, vol('2027-01'), TASAS_BASE).errores[0].motivo).toMatch(/^SIN_TARIFA_ANIO/);
  });
});

describe('Volúmenes BigQuery julio 2026', () => {
  it('suma sin quitar filas idénticas y cuadra con lo notificado por Operaciones', () => {
    const v = (nit: string, s: string) => volumenes.porNit.get(nit)?.get(s);
    expect(v('815000997', 'iFactura-Emision')).toBe(4337);
    expect(v('815000997', 'iFactura-Recepcion')).toBe(3439);
    expect(v('815000997', 'iFactura-DocSoporte')).toBe(398);
    expect(v('860070374', 'iFactura-Emision')).toBe(4076);
    expect(v('860070374', 'iFactura-DocSoporte')).toBe(225);
    expect(v('860070374', 'iFactura-Recepcion')).toBe(1026);
    expect(v('900914254', 'iFactura-Recepcion')).toBe(3813);
    expect(v('860007373', 'iFactura-Emision')).toBe(3646);
    expect(v('860037950', 'iFactura-Recepcion')).toBe(6088);
  });

  it('una fila negativa es un ajuste que resta; un total del mes negativo es error', () => {
    const fila = (cantidad: number) => ({ fecha: '2026-07-12', nit: '900482242', servicio: 'iFactura-Emision', cantidad });
    const v = agruparVolumenes([fila(500), fila(-130)], '2026-07');
    expect(v.porNit.get('900482242')!.get('iFactura-Emision')).toBe(370);
    expect(v.ajustesNegativos).toHaveLength(1);
    expect(() => agruparVolumenes([fila(-130)], '2026-07')).toThrow('negativo');
  });
});

describe('Empalme: motivos de lo que no cruza', () => {
  it('NIT sin contrato y servicio sin tarifa salen con su motivo, no se descartan', () => {
    const v = agruparVolumenes(
      [
        { fecha: '2026-07-01', nit: '999999999', servicio: 'iFactura-Emision', cantidad: 10 },
        { fecha: '2026-07-01', nit: '900914254', servicio: 'iFactura-Nomina', cantidad: 3 },
      ],
      '2026-07',
    );
    const r = liquidarPeriodo(contratos, v, TASAS_BASE);
    expect(r.noEmpalmados).toEqual([
      { nit: '999999999', servicio: 'iFactura-Emision', cantidad: 10, motivo: 'NIT_SIN_CONTRATO' },
      { nit: '900914254', servicio: 'iFactura-Nomina', cantidad: 3, motivo: 'SERVICIO_SIN_TARIFA' },
    ]);
  });

  it('un mínimo garantizado se cobra aunque el cliente no tenga volumen, marcado volumen_cero', () => {
    const r = liquidarPeriodo(contratos.filter((c) => c.nit === '860070374'), agruparVolumenes([], '2026-07'), TASAS_BASE);
    expect(r.liquidaciones.map((l) => [l.resultado.factura.subtotal, l.anomalias])).toEqual([
      [1418850, ['volumen_cero']],
      [578050, ['volumen_cero']],
    ]);
  });

  it('fuera de la vigencia del contrato el volumen sale como CONTRATO_NO_VIGENTE', () => {
    const v = agruparVolumenes([{ fecha: '2027-01-05', nit: '860007373', servicio: 'iFactura-Emision', cantidad: 100 }], '2027-01');
    expect(liquidarPeriodo(contratos, v, TASAS_BASE).noEmpalmados[0].motivo).toBe('CONTRATO_NO_VIGENTE');
  });
});

describe('Empalme julio 2026: todo el volumen de los 5 clientes encuentra su contrato', () => {
  it('8 liquidaciones, nada sin empalmar, sin errores de cálculo', () => {
    expect(julio.noEmpalmados).toEqual([]);
    expect(julio.errores).toEqual([]);
    expect(julio.liquidaciones).toHaveLength(8);
  });
});

describe('1:1 contra facturas emitidas — volumen de BigQuery', () => {
  it.each([
    // factura,   nit,         servicios,                                   subtotal,  iva,     total,     rtefte,    rteiva
    ['FE-24468', '860070374', 'iFactura-Emision+iFactura-DocSoporte', 1418850, 269582, 1688432, 49659.75, 40437.23],
    ['FE-24469', '860070374', 'iFactura-Recepcion', 578050, 109830, 687880, 20231.75, 16474.43],
    ['FE-24445', '900914254', 'iFactura-Recepcion', 874739, 166200, 1040939, 30615.87, 0],
    ['FE-24416', '860007373', 'iFactura-Emision', 4869096, 925128, 5794224, 170418.36, 0],
    ['FE-24352', '860037950', 'iFactura-Recepcion', 1327184, 252165, 1579349, 46451.44, 37824.74],
  ])('%s %s %s', (_f, nit, servicios, subtotal, iva, total, rtefte, rteiva) => {
    const r = buscar(julio, nit as string, servicios as string).resultado;
    expect(r.factura).toMatchObject({ subtotal, iva, total });
    expect(r.rtefte.valor).toBe(rtefte);
    expect(r.rteiva.valor).toBe(rteiva);
    expect(r.rteica.valor).toBe(0);
  });
});

describe('1:1 contra facturas emitidas — SANTA FE FE-24347 con el volumen facturado', () => {
  // BigQuery trae 43.750 cuentas médicas y 52.037 emisiones; la factura cobra
  // 62.393 (6.000 del mínimo + 56.393) y 52.162. Pendiente con Data/Contabilidad.
  // Con el volumen facturado, la regla reproduce la factura exacta.
  const volFactura = agruparVolumenes(
    [
      { fecha: '2026-07-31', nit: '860037950', servicio: 'ISALUD - Admin Cuentas Medicas', cantidad: 62393 },
      { fecha: '2026-07-31', nit: '860037950', servicio: 'iFactura-Emision', cantidad: 52162 },
    ],
    '2026-07',
  );
  const r = liquidarPeriodo(contratos.filter((c) => c.nit === '860037950'), volFactura, TASAS_BASE);
  const cm = buscar(r, '860037950', 'ISALUD - Admin Cuentas Medicas').resultado;
  const em = buscar(r, '860037950', 'iFactura-Emision').resultado;

  it('cuentas médicas: mínimo 7.128.368 + 56.393 × 1.029 (escalón del volumen total)', () => {
    expect(cm.tarifaUnitaria).toBe(1029);
    expect(cm.factura.subtotal).toBe(7128368 + 58028397);
  });

  it('emisión: 52.162 × 168', () => {
    expect(em.factura.subtotal).toBe(8763216);
  });

  it('la factura completa cuadra: subtotal, IVA, total y retenciones', () => {
    const suma = (f: (x: typeof cm) => number) => Math.round((f(cm) + f(em)) * 100) / 100;
    expect(suma((x) => x.factura.subtotal)).toBe(73919981);
    expect(suma((x) => x.factura.iva)).toBe(14044796);
    expect(suma((x) => x.factura.total)).toBe(87964777);
    expect(suma((x) => x.rtefte.valor)).toBe(2587199.34);
    expect(suma((x) => x.rteiva.valor)).toBe(2106719.46);
  });
});

describe('Diferencias conocidas (no son de la lógica)', () => {
  it.todo('ALMOTORES FE-24395 = 1.812.385: el tarifario tiene la tabla de ALKA MOTOR; falta la tarifa real de Contabilidad');
  it.todo('SANTA FE cuentas médicas: BigQuery 43.750 vs 62.393 facturadas; pendiente Data');
});
