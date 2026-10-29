import { diaSemana, festivosDelAnio, rangoDias } from './festivos';
import { detectarVariaciones, detectarVariacionMensual, esperadoDelDia, evaluarSerie, SerieDiaria } from './reglas';

describe('Festivos de Colombia', () => {
  it('2026: los 18 del calendario oficial (Pascua 5-abr, trasladables al lunes)', () => {
    expect([...festivosDelAnio(2026).keys()].sort()).toEqual([
      '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01',
      '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07',
      '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25',
    ]);
  });

  it('2025: Pascua 20-abr y San Pedro que cae en domingo pasa al lunes 30-jun', () => {
    const f = festivosDelAnio(2025);
    expect(f.get('2025-04-17')).toBe('Jueves Santo');
    expect(f.get('2025-06-02')).toBe('Ascensión del Señor');
    expect(f.get('2025-06-30')).toBe('San Pedro y San Pablo');
  });

  it('día de la semana', () => {
    expect(diaSemana('2026-07-13')).toBe(1); // lunes
    expect(diaSemana('2026-07-19')).toBe(0); // domingo
  });
});

/** Cliente que factura `habil` de lunes a viernes, `sabado` los sábados y nada los domingos. */
function serie(nit: string, habil: number, sabado = 0, cambios: Record<string, number> = {}, servicio = 'iFactura-Emision'): SerieDiaria {
  const dias = new Map<string, number>();
  for (const f of rangoDias('2026-06-01', '2026-07-31')) {
    const ds = diaSemana(f);
    dias.set(f, cambios[f] ?? (ds === 0 ? 0 : ds === 6 ? sabado : habil));
  }
  return { nit, servicio, dias };
}

describe('Lo esperado de un día', () => {
  it('lunes contra lunes: un sábado bajo no arrastra al promedio', () => {
    const s = serie('1', 1000, 100);
    expect(esperadoDelDia(s.dias, '2026-07-13')).toBe(1000);
    expect(esperadoDelDia(s.dias, '2026-07-18')).toBe(100);
  });

  it('con historia, solo mira hacia atrás: un cambio posterior no altera lo esperado de hoy', () => {
    // Desde el 20-jul el cliente pasa a 5.000 al día; el lunes 13 se sigue esperando 1.000.
    const despues = Object.fromEntries(rangoDias('2026-07-20', '2026-07-31').map((f) => [f, 5000]));
    expect(esperadoDelDia(serie('1', 1000, 0, despues).dias, '2026-07-13')).toBe(1000);
  });

  it('la mediana no se deja mover por un día raro', () => {
    const s = serie('1', 1000, 0, { '2026-07-06': 50_000 });
    expect(esperadoDelDia(s.dias, '2026-07-13')).toBe(1000);
  });
});

describe('Alertas por día', () => {
  it('caída, día en cero y alza se agrupan en UNA variación del mes por cliente y servicio', () => {
    const s = serie('1', 1000, 0, { '2026-07-08': 200, '2026-07-09': 0, '2026-07-22': 5000 });
    const { variaciones, generales } = detectarVariaciones([s], '2026-07');
    expect(generales).toEqual([]);
    expect(variaciones).toHaveLength(1);
    expect(variaciones[0].dias.map((d) => [d.fecha, d.marca])).toEqual([
      ['2026-07-08', 'caida'], ['2026-07-09', 'cero'], ['2026-07-22', 'alza'],
    ]);
    expect(variaciones[0].delta).toBe(-800 - 1000 + 4000);
  });

  it('el festivo no alerta: 20-jul sin transacciones es normal', () => {
    const s = serie('1', 1000, 0, { '2026-07-20': 0 });
    expect(detectarVariaciones([s], '2026-07').variaciones).toEqual([]);
    expect(evaluarSerie(s.dias, '2026-07-20', '2026-07-20')[0]).toMatchObject({ festivo: 'Independencia', marca: null });
  });

  it('el domingo en cero de un negocio que no abre los domingos no alerta', () => {
    expect(detectarVariaciones([serie('1', 1000)], '2026-07').variaciones).toEqual([]);
  });

  it('cliente pequeño (menos de 100 al día): no se alerta por ruido', () => {
    expect(detectarVariaciones([serie('1', 40, 0, { '2026-07-08': 0 })], '2026-07').variaciones).toEqual([]);
  });

  it('un día bajo que mueve menos del 5% del mes no alerta', () => {
    // 22 días hábiles × 10.000; caer a 2.500 un día = -3,4% del mes.
    expect(detectarVariaciones([serie('1', 10_000, 0, { '2026-07-08': 2500 })], '2026-07').variaciones).toEqual([]);
  });

  it('muchos clientes caen el mismo día → un evento general, no una alerta por cliente; el rebote del día siguiente no alerta', () => {
    const series = Array.from({ length: 12 }, (_, i) => serie(String(i + 1), 1000, 0, { '2026-07-13': 100, '2026-07-14': 3500 }));
    series.push(serie('99', 1000, 0, { '2026-07-08': 0, '2026-07-09': 0 })); // éste sí es del cliente (-8,7% del mes)
    const { generales, variaciones } = detectarVariaciones(series, '2026-07');
    expect(generales).toHaveLength(1);
    expect(generales[0]).toMatchObject({ fecha: '2026-07-13', seriesCaidas: 12, transaccionesFaltantes: 12 * 900 });
    expect(variaciones.map((v) => v.nit)).toEqual(['99']);
  });

  it('severidad por cuánto mueve el mes', () => {
    const cero5dias = serie('1', 1000, 0, Object.fromEntries(['06', '07', '08', '09', '10'].map((d) => [`2026-07-${d}`, 0])));
    const r = detectarVariaciones([cero5dias], '2026-07').variaciones[0];
    expect(r.variacion).toBeCloseTo(-5 / 23, 3);
    expect(r.severidad).toBe('alta');
  });

  it('cliente casi sin uso que un día hace 250: porcentaje enorme pero severidad media', () => {
    const r = detectarVariaciones([serie('1', 2, 0, { '2026-07-22': 250 })], '2026-07').variaciones[0];
    expect(r.variacion).toBeGreaterThan(5);
    expect(r.severidad).toBe('media');
  });
});

describe('Alertas por mes', () => {
  const completos = ['2026-04', '2026-05', '2026-06', '2026-07'];
  const tot = (v: number[]) => new Map(completos.map((p, i) => [p, v[i]]));

  it('2.000 al mes y de pronto 200: alerta crítica', () => {
    const r = detectarVariacionMensual('1', 'iFactura-Emision', tot([2000, 2100, 1900, 200]), '2026-07', completos)!;
    expect(r).toMatchObject({ base: 2000, mesesBase: ['2026-04', '2026-05', '2026-06'], severidad: 'critica' });
    expect(r.variacion).toBeCloseTo(-0.9, 5);
  });

  it('una variación normal no alerta, y sin 2 meses de historia no se compara', () => {
    expect(detectarVariacionMensual('1', 's', tot([2000, 2100, 1900, 1700]), '2026-07', completos)).toBeNull();
    expect(detectarVariacionMensual('1', 's', tot([0, 0, 1900, 200]), '2026-07', ['2026-06', '2026-07'])).toBeNull();
  });
});
