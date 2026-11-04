import Decimal from 'decimal.js';
import { MotorCalculoService } from '../calculo/motor-calculo.service';
import { ErrorCalculo, ResultadoCalculo, TasasTributarias } from '../calculo/tipos';
import type { ContratoTarifario, GrupoTarifario, ItemTarifario } from './tarifario-csv';
import { servicioDeLlave, type VolumenesPeriodo } from './volumenes-bigquery';

/**
 * Empalme Data ↔ Contabilidad para un periodo:
 *   volumen (NIT + Servicio)  →  contrato vigente del NIT  →  item que cubre el servicio
 *
 * Subservicio: el volumen llega como "Servicio/SubServicio" cuando Data lo trae.
 * Lo toma el item de ese subservicio (iDocumentos/ANI, con su propia tarifa) y,
 * si el contrato no lo separa, el item del servicio completo (iDocumentos).
 * y liquidación de cada item con el motor determinístico, con la tarifa del
 * año del periodo.
 *
 * Todo volumen que no empalma sale en `noEmpalmados` con su motivo: nada se
 * descarta en silencio. Un item con mínimo, fijo o recargo se liquida aunque
 * el cliente no haya tenido volumen (el mínimo se cobra igual), con anomalía
 * `volumen_cero` para que un humano lo mire.
 */

export type MotivoNoEmpalme =
  | 'NIT_SIN_CONTRATO'
  | 'CONTRATO_NO_VIGENTE'
  | 'SERVICIO_SIN_TARIFA'
  | 'SERVICIO_EN_VARIOS_CONTRATOS';

export interface NoEmpalmado {
  nit: string;
  servicio: string;
  cantidad: number;
  motivo: MotivoNoEmpalme;
}

export interface Liquidacion {
  nit: string;
  razonSocial: string;
  contratoId: string;
  servicios: string[];
  /** USD: `resultado` sale en dólares de liquidarPeriodo; EmpalmeService lo pasa a pesos y deja el USD en `usd`. */
  moneda: 'COP' | 'USD';
  usd?: { resultado: ResultadoCalculo; trm: number; fechaTrm: string };
  volumenesOrigen: { servicio: string; cantidad: number }[];
  resultado: ResultadoCalculo;
  anomalias: string[];
  /** Referencias a la base de datos (solo cuando los contratos vienen de ahí). */
  clienteId?: number;
  itemId?: number;
}

export interface ErrorLiquidacion {
  nit: string;
  contratoId: string;
  servicios: string[];
  motivo: string;
  volumen: number;
}

/** Consumo del mes de una suscripción Express (plan_anual): no se cobra, se compara con el tope. */
export interface ConsumoPlan {
  nit: string;
  contratoId: string;
  servicios: string[];
  cantidad: number;
  itemId?: number;
}

export interface ResultadoEmpalme {
  periodo: string;
  liquidaciones: Liquidacion[];
  noEmpalmados: NoEmpalmado[];
  errores: ErrorLiquidacion[];
  consumosPlan: ConsumoPlan[];
}

const NOMBRE_RETENCION = { rtefte: 'RteFte', rteiva: 'RteIVA', rteica: 'ReteICA' } as const;

/** Tasas globales (parametros_globales); el perfil del contrato las reemplaza por cliente. */
export type TasasBase = TasasTributarias;

function vigenteEn(c: ContratoTarifario, periodo: string): boolean {
  const inicioMes = `${periodo}-01`;
  const finMes = `${periodo}-31`; // comparación de texto AAAA-MM-DD: basta para "algún día del mes"
  return (c.vigenciaDesde == null || c.vigenciaDesde <= finMes) && (c.vigenciaHasta == null || c.vigenciaHasta >= inicioMes);
}


/** Valor del volumen que pasa de `umbral` (posiciones umbral+1 … umbral+exceso), cada posición al precio de su tramo. */
export function costoExcesoGrupo(umbral: number, exceso: number, escalones: GrupoTarifario['escalonesPorAnio'][number]): Decimal {
  const desde = umbral + 1;
  const hasta = umbral + exceso;
  let costo = new Decimal(0);
  let cubierto = 0;
  for (const e of escalones) {
    const a = Math.max(desde, e.volumenDesde);
    const b = Math.min(hasta, e.volumenHasta);
    if (b < a) continue;
    cubierto += b - a + 1;
    costo = costo.add(new Decimal(b - a + 1).mul(e.precioUnitario));
  }
  if (cubierto !== exceso) throw new Error(`los tramos del grupo no cubren ${exceso} transacciones sobre ${umbral}`);
  return costo;
}

interface ExtraGrupo {
  grupo: string;
  tope: number;
  /** Cobro del exceso del grupo que le toca a este NIT. */
  cobro: Decimal;
  volumenGrupo: number;
}

/**
 * Contratos de grupo: por cada grupo vigente suma el volumen del mes de todos sus items minimo_garantizado,
 * valora lo que pasa del umbral y lo reparte entre los NIT que superaron su propio tope, en proporción a
 * cuánto se pasó cada uno. Los mínimos de cada NIT se cobran siempre.
 */
function repartirGrupos(
  vigentes: ContratoTarifario[],
  asignado: Map<ItemTarifario, { servicio: string; cantidad: number }[]>,
  anio: number,
  errores: ErrorLiquidacion[],
): Map<ItemTarifario, ExtraGrupo> {
  const extra = new Map<ItemTarifario, ExtraGrupo>();
  const porGrupo = new Map<string, { grupo: GrupoTarifario; miembros: { c: ContratoTarifario; item: ItemTarifario; volumen: number; tope: number }[] }>();
  for (const c of vigentes) {
    if (!c.grupo) continue;
    for (const item of c.items) {
      const tope = item.tarifasPorAnio[anio]?.volumenTopeMinimo;
      if (item.modeloCobro !== 'minimo_garantizado' || tope == null) continue;
      const volumen = (asignado.get(item) ?? []).reduce((s, v) => s + v.cantidad, 0);
      const g = porGrupo.get(c.grupo.codigo) ?? { grupo: c.grupo, miembros: [] };
      g.miembros.push({ c, item, volumen, tope });
      porGrupo.set(c.grupo.codigo, g);
    }
  }
  for (const { grupo, miembros } of porGrupo.values()) {
    const total = miembros.reduce((s, m) => s + m.volumen, 0);
    const exceso = Math.max(0, total - grupo.umbral);
    const pesos = miembros.map((m) => Math.max(0, m.volumen - m.tope));
    const sumaPesos = pesos.reduce((s, w) => s + w, 0);
    let costo = new Decimal(0);
    if (exceso > 0) {
      try {
        costo = costoExcesoGrupo(grupo.umbral, exceso, grupo.escalonesPorAnio[anio] ?? []);
        if (sumaPesos === 0) throw new Error(`el grupo pasó el umbral (${total} > ${grupo.umbral}) pero ningún NIT superó su tope: no hay a quién cobrarle`);
      } catch (e) {
        for (const m of miembros) {
          errores.push({ nit: m.c.nit, contratoId: m.c.contratoId, servicios: m.item.servicios, volumen: m.volumen, motivo: `GRUPO ${grupo.codigo}: ${(e as Error).message}` });
        }
        continue;
      }
    }
    let asignadoAcum = new Decimal(0);
    const ultimo = pesos.map((w, i) => (w > 0 ? i : -1)).filter((i) => i >= 0).pop();
    miembros.forEach((m, i) => {
      let cobro = new Decimal(0);
      if (exceso > 0 && pesos[i] > 0) {
        cobro = i === ultimo ? costo.sub(asignadoAcum) : costo.mul(pesos[i]).div(sumaPesos).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        asignadoAcum = asignadoAcum.add(cobro);
      }
      extra.set(m.item, { grupo: grupo.codigo, tope: m.tope, cobro, volumenGrupo: total });
    });
  }
  return extra;
}

export function liquidarPeriodo(
  contratos: ContratoTarifario[],
  volumenes: VolumenesPeriodo,
  tasasBase: TasasBase,
  motor = new MotorCalculoService(),
): ResultadoEmpalme {
  const { periodo } = volumenes;
  const anio = Number(periodo.slice(0, 4));
  const res: ResultadoEmpalme = { periodo, liquidaciones: [], noEmpalmados: [], errores: [], consumosPlan: [] };

  const porNit = new Map<string, ContratoTarifario[]>();
  for (const c of contratos) porNit.set(c.nit, [...(porNit.get(c.nit) ?? []), c]);

  // 1. Asignar cada volumen (NIT + servicio) a un item, o explicar por qué no.
  const asignado = new Map<ItemTarifario, { servicio: string; cantidad: number }[]>();
  for (const [nit, servicios] of volumenes.porNit) {
    const delNit = porNit.get(nit) ?? [];
    const vigentes = delNit.filter((c) => vigenteEn(c, periodo));
    for (const [servicio, cantidad] of servicios) {
      let motivo: MotivoNoEmpalme | null = null;
      if (!delNit.length) motivo = 'NIT_SIN_CONTRATO';
      else if (!vigentes.length) motivo = 'CONTRATO_NO_VIGENTE';
      else {
        const cubren = (llave: string) => vigentes.flatMap((c) => c.items.filter((i) => i.servicios.includes(llave)));
        let items = cubren(servicio);
        if (items.length === 0 && servicioDeLlave(servicio) !== servicio) items = cubren(servicioDeLlave(servicio));
        // Un item por moneda: COP y USD del mismo servicio son dos cobros sobre las mismas transacciones.
        const repetido = items.some((it, i) => items.findIndex((o) => o.moneda === it.moneda) !== i);
        if (items.length === 0) motivo = 'SERVICIO_SIN_TARIFA';
        else if (repetido) motivo = 'SERVICIO_EN_VARIOS_CONTRATOS';
        else for (const it of items) asignado.set(it, [...(asignado.get(it) ?? []), { servicio, cantidad }]);
      }
      if (motivo) res.noEmpalmados.push({ nit, servicio, cantidad, motivo });
    }
  }

  // 1b. Contratos de grupo: el exceso mensual de la bolsa común se reparte entre los NIT que pasaron su tope.
  const extraGrupo = repartirGrupos(contratos.filter((x) => vigenteEn(x, periodo)), asignado, anio, res.errores);

  // 2. Liquidar cada item de los contratos vigentes con la tarifa del año del periodo.
  for (const c of contratos.filter((x) => vigenteEn(x, periodo))) {
    const tasas: TasasTributarias = {
      ...tasasBase,
      rtefte: c.perfil.rtefte ?? tasasBase.rtefte,
      rteiva: c.perfil.rteiva ?? tasasBase.rteiva,
      rteica: c.perfil.rteica ?? tasasBase.rteica,
    };
    // Sin las tres retenciones no se liquida: aplicar las globales a ciegas daría una factura equivocada.
    const faltan = (['rtefte', 'rteiva', 'rteica'] as const).filter((t) => c.perfil[t] == null);
    if (faltan.length) {
      for (const item of c.items) {
        const volumen = (asignado.get(item) ?? []).reduce((s, v) => s + v.cantidad, 0);
        // Express no se cobra por mes: su consumo frente al tope se registra aunque falten retenciones.
        if (item.modeloCobro === 'plan_anual') {
          res.consumosPlan.push({ nit: c.nit, contratoId: c.contratoId, servicios: item.servicios, cantidad: volumen, itemId: item.itemId });
          continue;
        }
        res.errores.push({
          nit: c.nit, contratoId: c.contratoId, servicios: item.servicios, volumen,
          motivo: `SIN_RETENCIONES: falta ${faltan.map((t) => NOMBRE_RETENCION[t]).join(', ')} del cliente; complétela en su ficha de Clientes`,
        });
      }
      continue;
    }
    for (const item of c.items) {
      const origen = asignado.get(item) ?? [];
      const volumen = origen.reduce((s, v) => s + v.cantidad, 0);
      if (item.modeloCobro === 'plan_anual') {
        // Express: el volumen empalma (no queda como "sin contrato") pero no se cobra por mes.
        res.consumosPlan.push({ nit: c.nit, contratoId: c.contratoId, servicios: item.servicios, cantidad: volumen, itemId: item.itemId });
        continue;
      }
      const tarifa = item.tarifasPorAnio[anio];
      const error = (motivo: string) =>
        res.errores.push({ nit: c.nit, contratoId: c.contratoId, servicios: item.servicios, motivo, volumen });

      if (!tarifa) {
        // Sin precios del año: si hubo consumo es plata que no se está cobrando.
        if (volumen > 0) error(`SIN_TARIFA_ANIO: el item no tiene precios para ${anio}`);
        continue;
      }
      const cobraSinVolumen =
        item.modeloCobro === 'minimo_garantizado' || item.modeloCobro === 'fijo_mensual' || !!tarifa.recargoFijo;
      if (volumen === 0 && !cobraSinVolumen) continue; // escala/bolsa sin consumo: no hay nada que cobrar

      try {
        const g = extraGrupo.get(item);
        // Miembro de grupo: el motor cobra solo el mínimo (volumen topado); el exceso valorado por el grupo va como recargo.
        const resultado = g
          ? motor.calcular({
              modeloCobro: item.modeloCobro,
              volumen: Math.min(volumen, g.tope),
              anioTarifa: anio,
              tarifa: { ...tarifa, recargoFijo: new Decimal(tarifa.recargoFijo ?? 0).add(g.cobro).toNumber() || null },
              tasas,
            })
          : motor.calcular({ modeloCobro: item.modeloCobro, volumen, anioTarifa: anio, tarifa, tasas });
        res.liquidaciones.push({
          nit: c.nit,
          razonSocial: c.razonSocial,
          contratoId: c.contratoId,
          servicios: item.servicios,
          moneda: item.moneda ?? 'COP',
          volumenesOrigen: origen,
          resultado,
          anomalias: [...(volumen === 0 ? ['volumen_cero'] : []), ...(g && g.cobro.gt(0) ? [`exceso_grupo:${g.grupo}`] : [])],
          clienteId: c.clienteId,
          itemId: item.itemId,
        });
      } catch (e) {
        error(e instanceof ErrorCalculo ? `${e.codigo}: ${e.message}` : (e as Error).message);
      }
    }
  }

  return res;
}
