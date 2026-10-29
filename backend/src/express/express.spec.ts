import { MotorCalculoService } from '../calculo/motor-calculo.service';
import { ErrorCalculo } from '../calculo/tipos';
import { leerTarifarioCsv } from '../empalme/tarifario-csv';
import { agruparVolumenes } from '../empalme/volumenes-bigquery';
import { liquidarPeriodo, TasasBase } from '../empalme/empalme';
import {
  cobrosDeSolicitud,
  consumoDelCiclo,
  DatosSolicitud,
  diasParaVencer,
  validarSolicitud,
  vigenciaHastaPorDefecto,
} from './express-reglas';

const TASAS: TasasBase = { iva: 0.19, rtefte: 0.035, rteica: 0, rteiva: 0, autorretencion: 0.008 };

// Renovación real de dato_expres.xlsx: GOMOSEC Recepción hasta 2.000 documentos, $1.508.529 (FV-24262).
const RENOVACION: DatosSolicitud = {
  tipo: 'RENOVACION',
  contratoId: 7,
  servicio: 'iFactura-Recepcion',
  tope: 2000,
  valorAnual: 1508529,
  vigenciaDesde: '2026-07-01',
  vigenciaHasta: '2027-06-30',
  tieneAdjunto: true,
};

describe('validarSolicitud: reglas por tipo', () => {
  it('renovación completa con PDF: válida', () => {
    expect(validarSolicitud(RENOVACION)).toEqual([]);
  });

  it('el PDF es obligatorio en renovación y cliente nuevo', () => {
    expect(validarSolicitud({ ...RENOVACION, tieneAdjunto: false })).toEqual([expect.stringContaining('PDF')]);
    const nuevo: DatosSolicitud = {
      ...RENOVACION, tipo: 'NUEVO', contratoId: null, nit: '900894782', razonSocial: 'IMPRESA', tasaRtefte: 0.035, tasaRteiva: 0, tasaRteica: 0, tieneAdjunto: false,
    };
    expect(validarSolicitud(nuevo)).toEqual([expect.stringContaining('PDF')]);
  });

  it('cobro de adicionales sin renovar: sin PDF es válido, pero exige cantidad y precio', () => {
    const base: DatosSolicitud = { tipo: 'COBRO_ADICIONAL', contratoId: 7, noRenueva: true, tieneAdjunto: false };
    expect(validarSolicitud({ ...base, cantidadAdicional: 20, precioAdicional: 1500 })).toEqual([]);
    expect(validarSolicitud(base)).toEqual([expect.stringContaining('cantidad y el precio de los adicionales')]);
    expect(validarSolicitud({ ...base, cantidadAdicional: 20 })).toContain('Para cobrar adicionales indique la cantidad y el precio unitario.');
  });

  it('cliente nuevo exige NIT numérico y las tres retenciones', () => {
    const errores = validarSolicitud({ ...RENOVACION, tipo: 'NUEVO', contratoId: null, nit: '900.894.782-1', razonSocial: 'X' });
    expect(errores).toEqual(expect.arrayContaining([
      expect.stringContaining('NIT'),
      expect.stringContaining('RteFte'),
      expect.stringContaining('RteIVA'),
      expect.stringContaining('RteICA'),
    ]));
  });

  it('"no renueva" solo aplica al cobro de adicionales', () => {
    expect(validarSolicitud({ ...RENOVACION, noRenueva: true })).toEqual([expect.stringContaining('No renueva')]);
  });
});

describe('Cobros de una solicitud aprobada (mismo motor que el resto de la facturación)', () => {
  it('renovación: valor anual con IVA en pesos, como la factura FV-24262', () => {
    const [plan] = cobrosDeSolicitud(RENOVACION, TASAS);
    expect(plan.concepto).toBe('PLAN_ANUAL');
    expect(plan.resultado.factura).toMatchObject({ subtotal: 1508529, iva: 286621, total: 1795150 });
    expect(plan.resultado.rtefte.valor).toBe(52798.52);
  });

  it('renovación con adicionales digitados por Comercial: dos cobros', () => {
    const cobros = cobrosDeSolicitud({ ...RENOVACION, cantidadAdicional: 20, precioAdicional: 1500 }, TASAS);
    expect(cobros.map((c) => [c.concepto, c.resultado.factura.subtotal])).toEqual([['PLAN_ANUAL', 1508529], ['ADICIONALES', 30000]]);
  });

  it('cobro de adicionales sin renovar: solo adicionales, cantidad × precio exacto', () => {
    const cobros = cobrosDeSolicitud({ tipo: 'COBRO_ADICIONAL', servicio: 'x', cantidadAdicional: 3, precioAdicional: 0.1 }, TASAS);
    expect(cobros).toHaveLength(1);
    expect(cobros[0].resultado.subtotal).toBe(0.3); // 3 × 0,1 sin error de punto flotante
  });
});

describe('Fechas y consumo del ciclo', () => {
  it('ciclo de 365 días: termina el día anterior a la renovación (incluye año bisiesto)', () => {
    expect(vigenciaHastaPorDefecto('2026-08-01')).toBe('2027-07-31');
    expect(vigenciaHastaPorDefecto('2027-03-01')).toBe('2028-02-29');
  });

  it('días para vencer', () => {
    expect(diasParaVencer('2026-11-20', new Date(2026, 9, 21))).toBe(30);
    expect(diasParaVencer('2026-10-20', new Date(2026, 9, 21))).toBe(-1);
    expect(diasParaVencer(null, new Date())).toBeNull();
  });

  it('consumo del ciclo: solo los meses desde el inicio de la vigencia', () => {
    const consumos = [
      { anio: 2026, mes: 6, cantidad: 999 },
      { anio: 2026, mes: 7, cantidad: 150 },
      { anio: 2026, mes: 8, cantidad: 170 },
    ];
    expect(consumoDelCiclo(consumos, '2026-07-01')).toBe(320);
    expect(consumoDelCiclo(consumos, null)).toBe(1319);
  });
});

describe('PLAN_ANUAL en el tarifario y en el empalme', () => {
  const csv = [
    'nit;razon_social;segmento;contrato_id;vigencia_desde;anio;servicios;volumen;modelo;desde;hasta;valor;periodicidad;rtefte;rteiva;rteica',
    '800032721;GOMOSEC LTDA;EXPRESS;800032721-EXP-RECEPCION;2026-01-01;2026;iFactura-Recepcion;;PLAN_ANUAL;1;2000;1508529;ANUAL;0.035;0;0',
  ].join('\n');
  const { contratos, errores } = leerTarifarioCsv(csv);

  it('se lee como plan_anual con su tope y valor', () => {
    expect(errores).toEqual([]);
    expect(contratos[0].items[0]).toMatchObject({
      modeloCobro: 'plan_anual',
      tarifasPorAnio: { 2026: { valorMinimo: 1508529, volumenTopeMinimo: 2000 } },
    });
  });

  it('en Express la columna volumen va vacía: CONJUNTO/SEPARADO es solo de corporativo', () => {
    const malo = leerTarifarioCsv(csv.replace('iFactura-Recepcion;;', 'iFactura-Recepcion;CONJUNTO;'));
    expect(malo.errores[0].mensaje).toContain('volumen no aplica a EXPRESS');
  });

  it('PLAN_ANUAL sin tope o mezclado con escalones es error', () => {
    const malo = leerTarifarioCsv(csv.replace(';1;2000;1508529;', ';1;;1508529;'));
    expect(malo.errores[0].mensaje).toContain('PLAN_ANUAL sin `hasta`');
  });

  it('el volumen de la suscripción empalma pero NO se cobra por mes: queda como consumo', () => {
    const v = agruparVolumenes([{ fecha: '2026-07-10', nit: '800032721', servicio: 'iFactura-Recepcion', cantidad: 180 }], '2026-07');
    const r = liquidarPeriodo(contratos, v, TASAS);
    expect(r.liquidaciones).toEqual([]);
    expect(r.noEmpalmados).toEqual([]);
    expect(r.errores).toEqual([]);
    expect(r.consumosPlan).toEqual([expect.objectContaining({ nit: '800032721', cantidad: 180 })]);
  });

  it('el motor se niega a liquidar un plan anual por mes', () => {
    expect(() =>
      new MotorCalculoService().calcular({ modeloCobro: 'plan_anual', volumen: 10, anioTarifa: 2026, tarifa: {}, tasas: TASAS }),
    ).toThrow(ErrorCalculo);
  });
});
