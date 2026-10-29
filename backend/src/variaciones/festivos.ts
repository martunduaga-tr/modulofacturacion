/**
 * Festivos de Colombia (Ley 51 de 1983, "Ley Emiliani"). Se calculan, no se
 * cargan: fijos, trasladables al lunes siguiente y los que dependen de la Pascua.
 * Fechas como texto AAAA-MM-DD para no pelear con zonas horarias.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const sumarDias = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano). */
function pascua(anio: number): Date {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(anio, mes, dia);
}

/** Si no cae en lunes, pasa al lunes siguiente. */
const alLunes = (d: Date) => sumarDias(d, (8 - d.getUTCDay()) % 7);

const cache = new Map<number, Map<string, string>>();

/** fecha -> nombre del festivo, para un año. */
export function festivosDelAnio(anio: number): Map<string, string> {
  const hit = cache.get(anio);
  if (hit) return hit;
  const p = pascua(anio);
  const lista: [Date, string][] = [
    [utc(anio, 1, 1), 'Año Nuevo'],
    [alLunes(utc(anio, 1, 6)), 'Reyes Magos'],
    [alLunes(utc(anio, 3, 19)), 'San José'],
    [sumarDias(p, -3), 'Jueves Santo'],
    [sumarDias(p, -2), 'Viernes Santo'],
    [utc(anio, 5, 1), 'Día del Trabajo'],
    [sumarDias(p, 43), 'Ascensión del Señor'],
    [sumarDias(p, 64), 'Corpus Christi'],
    [sumarDias(p, 71), 'Sagrado Corazón'],
    [alLunes(utc(anio, 6, 29)), 'San Pedro y San Pablo'],
    [utc(anio, 7, 20), 'Independencia'],
    [utc(anio, 8, 7), 'Batalla de Boyacá'],
    [alLunes(utc(anio, 8, 15)), 'Asunción de la Virgen'],
    [alLunes(utc(anio, 10, 12)), 'Día de la Raza'],
    [alLunes(utc(anio, 11, 1)), 'Todos los Santos'],
    [alLunes(utc(anio, 11, 11)), 'Independencia de Cartagena'],
    [utc(anio, 12, 8), 'Inmaculada Concepción'],
    [utc(anio, 12, 25), 'Navidad'],
  ];
  const mapa = new Map(lista.map(([d, n]) => [iso(d), n]));
  cache.set(anio, mapa);
  return mapa;
}

export function nombreFestivo(fecha: string): string | null {
  return festivosDelAnio(Number(fecha.slice(0, 4))).get(fecha) ?? null;
}

// Las reglas consultan las mismas fechas miles de veces: se cachea el día absoluto.
const diaAbsoluto = new Map<string, number>();
function diaNumero(fecha: string): number {
  let n = diaAbsoluto.get(fecha);
  if (n == null) {
    n = Math.round(new Date(`${fecha}T00:00:00Z`).getTime() / 86_400_000);
    diaAbsoluto.set(fecha, n);
  }
  return n;
}

/** 0 = domingo … 6 = sábado (el 1-ene-1970 fue jueves). */
export function diaSemana(fecha: string): number {
  return (diaNumero(fecha) + 4) % 7;
}

/** Días AAAA-MM-DD entre desde y hasta, ambos incluidos. */
export function rangoDias(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${desde}T00:00:00Z`); iso(d) <= hasta; d = sumarDias(d, 1)) out.push(iso(d));
  return out;
}

export function diasEntre(a: string, b: string): number {
  return diaNumero(b) - diaNumero(a);
}
