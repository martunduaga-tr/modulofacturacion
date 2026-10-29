import Decimal from 'decimal.js';
import type { ModeloCobro, Moneda } from '../contratos/entities/contrato-item.entity';
import type { EscalonTarifa, TarifaEntrada } from '../calculo/tipos';
import { detectarSeparador, parsearCsv } from './csv';

/**
 * Lector del formato de carga del tarifario de Contabilidad
 * (Maestro_Contratos_Contabilidad.csv; separador `;` o `,`, se detecta solo). Una fila por escalón:
 *
 *   nit;razon_social;segmento;contrato_id;vigencia_desde;vigencia_hasta;moneda;anio;
 *   servicios;volumen;modelo;desde;hasta;valor;periodicidad;rtefte;rteiva;rteica;observaciones
 *
 * - `anio`: año de los precios (las tarifas se versionan por año, ej. IPC de enero).
 * - `servicios`: códigos de servicio TAL COMO los reporta Data (BigQuery),
 *   unidos con `+`. No hay tabla de equivalencias: el nombre es la llave.
 * - `segmento`: es del contrato. Un mismo NIT puede tener contratos de los dos
 *   (ALKA MOTOR: Emisión corporativo; Recepción, DocSoporte y Nómina Express).
 * - `volumen` (solo CORPORATIVO): CONJUNTO = los servicios suman volumen contra una
 *   sola tabla (ALMOTORES, CONFIANZA); SEPARADO = cada servicio se cobra por su propio
 *   volumen con la misma tabla (SANTA FE Emisión/Recepción, factura FE-24352).
 *   En EXPRESS va vacío: cada suscripción tiene su propia tarifa y su propio tope.
 * - `modelo`: ESCALA | MINIMO | BOLSA | FIJO | RECARGO | PLAN_ANUAL. `hasta` vacío = en adelante.
 *   PLAN_ANUAL (Express): `hasta` = tope de documentos, `valor` = valor anual. Solo registra
 *   el plan: el cobro lo genera cada solicitud de Comercial aprobada (ver express/).
 * - `rtefte`/`rteiva`/`rteica`: perfil tributario del cliente: fracción (0.035) o
 *   porcentaje (3,5%); 0 si no aplica. Vacío = se deja el que el cliente ya tiene
 *   (ficha de Clientes); si no tiene, el contrato no se carga (no hay tasa por defecto).
 * - `moneda`: de cada fila/ítem, COP (por defecto) o USD. Un servicio puede tener un ítem en COP y
 *   otro en USD en el mismo contrato: son dos cobros sobre las mismas transacciones (Seguros del
 *   Estado). El USD se pasa a pesos con la TRM del día en que se emite la factura.
 * - Números con coma decimal (Excel en Colombia) o punto decimal.
 */

export type Segmento = 'CORPORATIVO' | 'EXPRESS';

export interface PerfilTributario {
  rtefte: number | null;
  rteiva: number | null;
  rteica: number | null;
}

export interface ItemTarifario {
  /** Servicios de Data cuyo volumen se suma para este item. */
  servicios: string[];
  modeloCobro: ModeloCobro;
  /** Moneda de la tarifa. USD: el subtotal se convierte a COP con la TRM del día de la factura. */
  moneda: Moneda;
  /** Precios del item por año (anio -> tarifa). */
  tarifasPorAnio: Record<number, TarifaEntrada>;
  /** coe.contrato_items.id cuando el item viene de la base de datos. */
  itemId?: number;
}

export interface ContratoTarifario {
  contratoId: string;
  nit: string;
  razonSocial: string;
  segmento: Segmento;
  vigenciaDesde: string | null; // AAAA-MM-DD
  vigenciaHasta: string | null;
  moneda: string;
  perfil: PerfilTributario;
  items: ItemTarifario[];
  /** coe.clientes.id cuando el contrato viene de la base de datos. */
  clienteId?: number;
}

export interface ErrorTarifario {
  fila: number; // fila del CSV (1 = encabezado)
  contratoId: string;
  mensaje: string;
}

const MODELOS = ['ESCALA', 'MINIMO', 'BOLSA', 'FIJO', 'RECARGO', 'PLAN_ANUAL'] as const;
type ModeloCsv = (typeof MODELOS)[number];

interface FilaTarifario {
  numero: number;
  datos: Record<string, string>;
}

const soloDigitos = (s: string) => s.replace(/\D/g, '');

/**
 * Números como los escribe Excel en Colombia o en formato estándar:
 *   "236,45" / "1.508.529,50" (coma decimal, punto de miles) · "236.45" / "1508529" (punto decimal).
 * Un solo punto sin coma ("50.904") es decimal, como lo guarda Excel con números
 * sin formato; el instructivo pide no usar separador de miles.
 */
function numero(valor: string, maxDecimales = 4): number {
  let v = valor.replace(/[\s$]/g, '');
  if (/\de[+-]?\d/i.test(v)) {
    throw new Error(`"${valor}" está en notación científica: Excel recortó el número; dele formato de número a la celda`);
  }
  if (v.includes(',')) {
    if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(v) && !/^-?\d+(,\d+)?$/.test(v)) {
      throw new Error(`valor numérico inválido: "${valor}"`);
    }
    v = v.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(v)) {
    v = v.replace(/\./g, ''); // 1.508.529: puntos de miles
  }
  const n = Number(v);
  if (v === '' || !Number.isFinite(n)) throw new Error(`valor numérico inválido: "${valor}"`);
  if (Math.abs(n) >= 1e12) throw new Error(`valor fuera de rango: "${valor}" (máximo 999.999.999.999)`);
  if ((v.split('.')[1] ?? '').length > maxDecimales) {
    throw new Error(`"${valor}" tiene más de ${maxDecimales} decimales (se guarda con ${maxDecimales})`);
  }
  return n;
}

/**
 * Tasa de retención, OBLIGATORIA por cliente: en las facturas de julio las
 * tasas reales no coincidieron con las globales (RteICA 0 en los 5 clientes),
 * así que dejarla vacía no puede caer en silencio a un valor por defecto.
 * Acepta fracción (0.035 / 0,035) o porcentaje (3,5%).
 */
function tasa(valor: string, campo: string): number | null {
  if (valor.trim() === '') return null;
  const pct = valor.trim().endsWith('%');
  // Tasas: 6 decimales en la BD (DECIMAL(9,6)); en porcentaje caben 4 (0,9660%).
  const n = numero(valor.replace('%', ''), pct ? 4 : 6);
  const t = pct ? new Decimal(n).div(100).toNumber() : n;
  if (t < 0 || t >= 1) throw new Error(`${campo} fuera de rango: "${valor}" (use 0.035 o 3,5%)`);
  return t;
}

function fecha(valor: string, campo: string): string | null {
  if (valor.trim() === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) throw new Error(`${campo} debe ser AAAA-MM-DD, no "${valor}"`);
  return valor.trim();
}

/** Las filas de un año de un item → modelo de cobro + TarifaEntrada del motor. */
function construirTarifaAnio(filas: FilaTarifario[]): { modeloCobro: ModeloCobro; tarifa: TarifaEntrada } {
  const modeloDe = (f: FilaTarifario) => f.datos.modelo.toUpperCase() as ModeloCsv;
  const modelos = new Set(filas.map(modeloDe));
  for (const m of modelos) {
    if (!MODELOS.includes(m)) throw new Error(`modelo desconocido "${m}" (válidos: ${MODELOS.join(', ')})`);
  }

  if (modelos.has('PLAN_ANUAL')) {
    if (filas.length > 1) throw new Error('PLAN_ANUAL va en una sola fila por suscripción y año (sin escalones ni otros modelos)');
    const f = filas[0].datos;
    if (f.hasta.trim() === '') throw new Error('PLAN_ANUAL sin `hasta` (tope de documentos del plan)');
    return {
      modeloCobro: 'plan_anual',
      tarifa: { escalones: [], valorMinimo: numero(f.valor), volumenTopeMinimo: numero(f.hasta), valorFijo: null, recargoFijo: null },
    };
  }

  const escalones: EscalonTarifa[] = filas
    .filter((f) => modeloDe(f) === 'ESCALA' || modeloDe(f) === 'BOLSA')
    .map((f) => ({
      volumenDesde: numero(f.datos.desde),
      volumenHasta: f.datos.hasta.trim() === '' ? Number.MAX_SAFE_INTEGER : numero(f.datos.hasta),
      precioUnitario: numero(f.datos.valor),
    }))
    .sort((a, b) => a.volumenDesde - b.volumenDesde);

  for (let i = 1; i < escalones.length; i++) {
    if (escalones[i].volumenDesde <= escalones[i - 1].volumenHasta) {
      throw new Error(`escalones solapados: ${escalones[i - 1].volumenDesde}-${escalones[i - 1].volumenHasta} y ${escalones[i].volumenDesde}`);
    }
  }

  const minimos = filas.filter((f) => modeloDe(f) === 'MINIMO');
  const fijos = filas.filter((f) => modeloDe(f) === 'FIJO');
  const recargo = filas
    .filter((f) => modeloDe(f) === 'RECARGO')
    .reduce((s, f) => s.add(numero(f.datos.valor)), new Decimal(0))
    .toNumber(); // decimal exacto, no float

  if (minimos.length > 1) throw new Error('más de una fila MINIMO para los mismos servicios y año');
  if (fijos.length > 1) throw new Error('más de una fila FIJO para los mismos servicios y año');

  let modeloCobro: ModeloCobro;
  if (modelos.has('BOLSA')) {
    if (modelos.has('ESCALA') || minimos.length || fijos.length) throw new Error('BOLSA no se combina con ESCALA, MINIMO ni FIJO');
    modeloCobro = 'bolsa';
  } else if (minimos.length) {
    if (fijos.length) throw new Error('MINIMO no se combina con FIJO');
    if (minimos[0].datos.hasta.trim() === '') throw new Error('MINIMO sin `hasta` (tope de transacciones que cubre el mínimo)');
    modeloCobro = 'minimo_garantizado';
  } else if (fijos.length) {
    modeloCobro = 'fijo_mensual';
  } else if (escalones.length) {
    modeloCobro = 'volumen_escalonado';
  } else {
    throw new Error('solo tiene RECARGO: falta la regla de cobro principal');
  }

  return {
    modeloCobro,
    tarifa: {
      escalones,
      valorMinimo: minimos[0] ? numero(minimos[0].datos.valor) : null,
      volumenTopeMinimo: minimos[0] ? numero(minimos[0].datos.hasta) : null,
      valorFijo: fijos[0] ? numero(fijos[0].datos.valor) : null,
      recargoFijo: recargo || null,
    },
  };
}

/** Todas las filas (todos los años) de un conjunto de servicios → item. */
function construirItem(servicios: string[], moneda: Moneda, filas: FilaTarifario[]): ItemTarifario {
  const porAnio = new Map<number, FilaTarifario[]>();
  for (const f of filas) {
    const anio = numero(f.datos.anio ?? '');
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new Error(`anio inválido: "${f.datos.anio}"`);
    porAnio.set(anio, [...(porAnio.get(anio) ?? []), f]);
  }

  let modeloCobro: ModeloCobro | null = null;
  const tarifasPorAnio: Record<number, TarifaEntrada> = {};
  for (const [anio, filasAnio] of porAnio) {
    const t = construirTarifaAnio(filasAnio);
    // contrato_items.modelo_cobro es uno solo por item: no puede cambiar entre años.
    if (modeloCobro && modeloCobro !== t.modeloCobro) {
      throw new Error(`${servicios.join('+')}: el modelo cambia entre años (${modeloCobro} / ${t.modeloCobro}); cárguelo como contrato distinto`);
    }
    modeloCobro = t.modeloCobro;
    tarifasPorAnio[anio] = t.tarifa;
  }
  return { servicios, modeloCobro: modeloCobro!, moneda, tarifasPorAnio };
}

export function leerTarifarioCsv(texto: string): { contratos: ContratoTarifario[]; errores: ErrorTarifario[] } {
  const filas = parsearCsv(texto, detectarSeparador(texto)).map((datos, i) => ({ numero: i + 2, datos }));
  const errores: ErrorTarifario[] = [];
  const porContrato = new Map<string, FilaTarifario[]>();

  for (const f of filas) {
    const id = f.datos.contrato_id;
    if (!id || !soloDigitos(f.datos.nit ?? '')) {
      errores.push({ fila: f.numero, contratoId: id ?? '', mensaje: 'fila sin contrato_id o sin NIT' });
      continue;
    }
    porContrato.set(id, [...(porContrato.get(id) ?? []), f]);
  }

  const contratos: ContratoTarifario[] = [];
  for (const [contratoId, filasContrato] of porContrato) {
    const cab = filasContrato[0].datos;
    try {
      const nits = new Set(filasContrato.map((f) => soloDigitos(f.datos.nit)));
      if (nits.size > 1) throw new Error(`el contrato tiene filas con NIT distintos: ${[...nits].join(', ')}`);

      const monedaDe = (f: FilaTarifario) => (f.datos.moneda || 'COP').trim().toUpperCase();
      const otraMoneda = filasContrato.map(monedaDe).find((m) => m !== 'COP' && m !== 'USD');
      if (otraMoneda) throw new Error(`moneda ${otraMoneda} no soportada (COP o USD)`);
      const moneda = monedaDe(filasContrato[0]);

      const segmento = (cab.segmento || 'CORPORATIVO').toUpperCase();
      if (segmento !== 'CORPORATIVO' && segmento !== 'EXPRESS') throw new Error(`segmento debe ser CORPORATIVO o EXPRESS, no "${segmento}"`);

      if (segmento === 'EXPRESS' && filasContrato.some((f) => (f.datos.volumen ?? '').trim() !== '')) {
        throw new Error('volumen no aplica a EXPRESS: cada suscripción tiene su propia tarifa y tope (deje la columna vacía)');
      }

      // Agrupar por (servicios, volumen, moneda); SEPARADO se expande a un item por servicio con la misma tabla.
      const grupos = new Map<string, FilaTarifario[]>();
      for (const f of filasContrato) {
        const clave = `${f.datos.servicios}|${(f.datos.volumen || 'CONJUNTO').toUpperCase()}|${monedaDe(f)}`;
        grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
      }

      const items: ItemTarifario[] = [];
      for (const [clave, filasGrupo] of grupos) {
        const [servs, modo, mon] = clave.split('|');
        const servicios = servs.split('+').map((s) => s.trim()).filter(Boolean);
        if (!servicios.length) throw new Error('fila sin servicios');
        if (modo !== 'CONJUNTO' && modo !== 'SEPARADO') throw new Error(`volumen debe ser CONJUNTO o SEPARADO, no "${modo}"`);
        const conjuntos = modo === 'SEPARADO' ? servicios.map((s) => [s]) : [servicios];
        for (const c of conjuntos) items.push(construirItem(c, mon as Moneda, filasGrupo));
      }

      // Un servicio va en una sola regla por moneda (COP y USD sí pueden convivir: son cobros distintos).
      const servicioRepetido = items.flatMap((i) => i.servicios.map((s) => `${s} (${i.moneda})`)).find((s, i, arr) => arr.indexOf(s) !== i);
      if (servicioRepetido) throw new Error(`el servicio ${servicioRepetido} aparece en más de una regla del contrato`);

      contratos.push({
        contratoId,
        nit: soloDigitos(cab.nit),
        razonSocial: cab.razon_social,
        segmento: segmento as Segmento,
        vigenciaDesde: fecha(cab.vigencia_desde ?? '', 'vigencia_desde'),
        vigenciaHasta: fecha(cab.vigencia_hasta ?? '', 'vigencia_hasta'),
        moneda,
        perfil: { rtefte: tasa(cab.rtefte ?? '', 'rtefte'), rteiva: tasa(cab.rteiva ?? '', 'rteiva'), rteica: tasa(cab.rteica ?? '', 'rteica') },
        items,
      });
    } catch (e) {
      errores.push({ fila: filasContrato[0].numero, contratoId, mensaje: (e as Error).message });
    }
  }

  return { contratos, errores };
}
