import { diaSemana, diasEntre, nombreFestivo } from './festivos';

/**
 * Reglas de variación: cada cliente se compara contra SU PROPIO comportamiento,
 * no contra un número fijo. Calibradas con julio 2026 (8,84 M transacciones):
 * con umbrales sueltos salían 402 alertas en un mes; con estas, ~46, y entre ellas
 * casos reales (Santa Fe Cuentas Médicas +25,8%, la diferencia con lo facturado).
 */
export const UMBRALES = {
  /** Por debajo de esto un día es ruido (cliente pequeño): no se evalúa. */
  minimoEsperadoDia: 100,
  /** Caída: el día quedó en el 30% o menos de lo esperado. */
  caida: 0.3,
  /** Alza: el día triplicó lo esperado y por al menos 200 transacciones. */
  alza: 3,
  alzaMinima: 200,
  /**
   * Día con muchas caídas a la vez = evento de la plataforma o de Data, no del cliente.
   * Julio: el 13 cayó el 81,6% de los servicios evaluados; los demás días, 9-18%.
   */
  generalMinimoSeries: 10,
  generalProporcion: 0.3,
  /** La variación del mes por días anómalos debe mover al menos esto para alertar. */
  impactoMinimoMes: 0.05,
  /** Mensual: contra el promedio de hasta 3 meses anteriores completos. */
  mesesBase: 3,
  minimoBaseMes: 300,
  /** Severidad: el porcentaje solo cuenta si además mueve suficientes transacciones. */
  criticaMinimoTrx: 1000,
  altaMinimoTrx: 300,
  caidaMes: -0.4,
  alzaMes: 0.6,
};

export type MarcaDia = 'caida' | 'cero' | 'alza';
export type Severidad = 'critica' | 'alta' | 'media';

export interface SerieDiaria {
  nit: string;
  servicio: string;
  /** Todos los días cargados (los que no vinieron en BigQuery van en 0). */
  dias: Map<string, number>;
}

export interface DiaEvaluado {
  fecha: string;
  cantidad: number;
  esperado: number | null;
  marca: MarcaDia | null;
  festivo: string | null;
  /** Día de caída general (no se atribuye al cliente). */
  general: boolean;
}

export interface VariacionSerie {
  nit: string;
  servicio: string;
  periodo: string;
  dias: { fecha: string; cantidad: number; esperado: number; marca: MarcaDia }[];
  /** Transacciones de diferencia contra lo esperado en esos días (+ alza, − caída). */
  delta: number;
  totalMes: number;
  /** delta sobre lo que habría sido el mes sin la anomalía. */
  variacion: number;
  severidad: Severidad;
}

export interface EventoGeneral {
  fecha: string;
  seriesCaidas: number;
  seriesEvaluadas: number;
  nits: string[];
  transaccionesFaltantes: number;
}

export interface VariacionMensual {
  nit: string;
  servicio: string;
  periodo: string;
  total: number;
  base: number;
  mesesBase: string[];
  variacion: number;
  mismoMesAnioAnterior: number | null;
  severidad: Severidad;
}

const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** H = día hábil, S = sábado, D = domingo o festivo. */
const clase = (f: string) => (nombreFestivo(f) || diaSemana(f) === 0 ? 'D' : diaSemana(f) === 6 ? 'S' : 'H');

/**
 * Lo esperado para un día: mediana del mismo día de la semana en las 8 semanas
 * ANTERIORES (así sirve para alertar el mismo día). Al comienzo del histórico,
 * sin 3 semanas previas, usa las 8 semanas alrededor; y si tampoco alcanza,
 * los días de su misma clase (±4 semanas, mínimo 5). La mediana no se deja
 * arrastrar por un día raro. Festivos y días de evento general no sirven de referencia.
 */
export function esperadoDelDia(dias: Map<string, number>, fecha: string, excluir: Set<string> = new Set()): number | null {
  const candidatos = [...dias.keys()].filter((o) => o !== fecha && !excluir.has(o) && !nombreFestivo(o) && Math.abs(diasEntre(o, fecha)) <= 56);
  const ds = diaSemana(fecha);
  const mismos = candidatos.filter((o) => diaSemana(o) === ds);
  const previos = mismos.filter((o) => o < fecha);
  if (previos.length >= 3) return mediana(previos.map((o) => dias.get(o)!));
  if (mismos.length >= 3) return mediana(mismos.map((o) => dias.get(o)!));
  const c = clase(fecha);
  const parecidos = candidatos.filter((o) => clase(o) === c && Math.abs(diasEntre(o, fecha)) <= 28);
  return parecidos.length >= 5 ? mediana(parecidos.map((o) => dias.get(o)!)) : null;
}

export function marcar(cantidad: number, esperado: number | null): MarcaDia | null {
  if (esperado == null) return null;
  if (esperado >= UMBRALES.minimoEsperadoDia && cantidad <= UMBRALES.caida * esperado) return cantidad === 0 ? 'cero' : 'caida';
  if (cantidad >= UMBRALES.alza * esperado && cantidad - esperado >= UMBRALES.alzaMinima) return 'alza';
  return null;
}

/** Evalúa cada día de la serie (para la gráfica y para las alertas). */
export function evaluarSerie(dias: Map<string, number>, desde: string, hasta: string, generales: Set<string> = new Set()): DiaEvaluado[] {
  const out: DiaEvaluado[] = [];
  for (const [fecha, cantidad] of [...dias.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (fecha < desde || fecha > hasta) continue;
    const festivo = nombreFestivo(fecha);
    const general = generales.has(fecha);
    const esperado = esperadoDelDia(dias, fecha, generales);
    // Festivo o evento general: se muestra lo esperado, pero no se marca al cliente.
    const marca = festivo || general ? null : marcar(cantidad, esperado);
    out.push({ fecha, cantidad, esperado, marca, festivo, general });
  }
  return out;
}

/**
 * Un cliente que casi no factura y un día hace 200 da +20.000%: el porcentaje solo
 * sube la severidad si la diferencia en transacciones también es grande.
 */
function severidadPorImpacto(variacion: number, delta: number): Severidad {
  const v = Math.abs(variacion), d = Math.abs(delta);
  if (v >= 0.25 && d >= UMBRALES.criticaMinimoTrx) return 'critica';
  if (v >= 0.1 && d >= UMBRALES.altaMinimoTrx) return 'alta';
  return 'media';
}

/**
 * Variaciones por día del periodo AAAA-MM.
 * 1) Días en que caen muchas series a la vez → un solo evento general.
 * 2) Por cliente y servicio: los días anómalos del mes, agrupados en una sola
 *    variación, si mueven el mes al menos `impactoMinimoMes`. El alza del día
 *    siguiente a un evento general se toma como recuperación, no como anomalía.
 */
export function detectarVariaciones(series: SerieDiaria[], periodo: string): { generales: EventoGeneral[]; variaciones: VariacionSerie[] } {
  const enPeriodo = (f: string) => f.startsWith(periodo);

  // 1) Primera pasada: caídas por día en todas las series.
  const porDia = new Map<string, { caidas: number; evaluadas: number; nits: Set<string>; faltan: number }>();
  for (const s of series) {
    for (const [fecha, cantidad] of s.dias) {
      if (!enPeriodo(fecha) || nombreFestivo(fecha)) continue;
      const esperado = esperadoDelDia(s.dias, fecha);
      if (esperado == null || esperado < UMBRALES.minimoEsperadoDia) continue;
      const d = porDia.get(fecha) ?? { caidas: 0, evaluadas: 0, nits: new Set<string>(), faltan: 0 };
      d.evaluadas++;
      const m = marcar(cantidad, esperado);
      if (m === 'caida' || m === 'cero') {
        d.caidas++;
        d.nits.add(s.nit);
        d.faltan += esperado - cantidad;
      }
      porDia.set(fecha, d);
    }
  }
  const generales: EventoGeneral[] = [...porDia.entries()]
    .filter(([, d]) => d.caidas >= Math.max(UMBRALES.generalMinimoSeries, UMBRALES.generalProporcion * d.evaluadas))
    .map(([fecha, d]) => ({
      fecha,
      seriesCaidas: d.caidas,
      seriesEvaluadas: d.evaluadas,
      nits: [...d.nits].sort(),
      transaccionesFaltantes: Math.round(d.faltan),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const fechasGenerales = new Set(generales.map((g) => g.fecha));

  // Día hábil siguiente a cada evento general: posible recuperación.
  const recuperacion = new Set<string>();
  for (const g of generales) {
    const t = new Date(`${g.fecha}T00:00:00Z`);
    for (let i = 1; i <= 4; i++) {
      const f = new Date(t.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      if (clase(f) === 'H') {
        recuperacion.add(f);
        break;
      }
    }
  }

  // 2) Segunda pasada por serie, sin los días generales como referencia.
  const variaciones: VariacionSerie[] = [];
  for (const s of series) {
    const evaluados = evaluarSerie(s.dias, `${periodo}-01`, `${periodo}-31`, fechasGenerales);
    const marcados = evaluados.filter((d) => d.marca && !(d.marca === 'alza' && recuperacion.has(d.fecha)));
    if (!marcados.length) continue;
    const totalMes = evaluados.reduce((a, d) => a + d.cantidad, 0);
    const delta = marcados.reduce((a, d) => a + d.cantidad - d.esperado!, 0);
    const sinAnomalia = totalMes - delta;
    const variacion = sinAnomalia > 0 ? delta / sinAnomalia : 0;
    if (Math.abs(variacion) < UMBRALES.impactoMinimoMes) continue;
    variaciones.push({
      nit: s.nit,
      servicio: s.servicio,
      periodo,
      dias: marcados.map((d) => ({ fecha: d.fecha, cantidad: d.cantidad, esperado: d.esperado!, marca: d.marca! })),
      delta: Math.round(delta),
      totalMes,
      variacion,
      severidad: severidadPorImpacto(variacion, delta),
    });
  }
  return { generales, variaciones };
}

/**
 * Variación del mes contra el promedio de hasta 3 meses anteriores completos
 * (mínimo 2). `totales`: periodo → total, con 0 en los meses cargados sin consumo.
 */
export function detectarVariacionMensual(
  nit: string,
  servicio: string,
  totales: Map<string, number>,
  periodo: string,
  completos: string[],
): VariacionMensual | null {
  const total = totales.get(periodo);
  if (total == null) return null;
  const previos = completos.filter((p) => p < periodo).sort().slice(-UMBRALES.mesesBase);
  if (previos.length < 2) return null;
  const base = previos.reduce((a, p) => a + (totales.get(p) ?? 0), 0) / previos.length;
  if (base < UMBRALES.minimoBaseMes) return null;
  const variacion = (total - base) / base;
  if (variacion > UMBRALES.caidaMes && variacion < UMBRALES.alzaMes) return null;
  const anioAnterior = `${Number(periodo.slice(0, 4)) - 1}${periodo.slice(4)}`;
  return {
    nit,
    servicio,
    periodo,
    total,
    base: Math.round(base),
    mesesBase: previos,
    variacion,
    mismoMesAnioAnterior: completos.includes(anioAnterior) ? totales.get(anioAnterior) ?? 0 : null,
    severidad: Math.abs(variacion) >= 0.7 ? 'critica' : 'alta',
  };
}
