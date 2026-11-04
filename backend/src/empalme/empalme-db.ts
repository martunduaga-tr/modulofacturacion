import type { Contrato } from '../contratos/entities/contrato.entity';
import type { TarifaEntrada } from '../calculo/tipos';
import type { PreLiquidado } from '../calculo/entities/pre-liquidado.entity';
import type { ContratoTarifario, GrupoTarifario } from './tarifario-csv';
import type { Liquidacion } from './empalme';

/**
 * Funciones puras entre la base de datos y el empalme (sin repositorios, para
 * poder probarlas sin SQL Server).
 */

export interface TarifasDeItemAnio {
  escalones: { volumenDesde: number; volumenHasta: number; precioUnitario: number }[];
  minimo: { valorMinimo: number; volumenTope: number | null } | null;
  valorFijo: number | null;
  recargo: number;
}

/**
 * Contratos activos de la BD → formato del empalme. Solo entran clientes
 * activos e items activos. Un item cuyo servicio no tiene `codigo_data` no
 * puede empalmar con Data: se informa en `sinCodigoData` para que alguien le
 * asigne el nombre del servicio, en vez de ignorarlo en silencio.
 */
export function contratosDesdeBd(
  contratos: Contrato[],
  tarifasPorItem: Map<number, TarifasDeItemAnio>,
  anio: number,
  /** contratos.id → grupo al que pertenece (contrato de grupo, ver 17_grupos_tarifa.sql). */
  grupos: Map<number, GrupoTarifario> = new Map(),
): { contratos: ContratoTarifario[]; sinCodigoData: { contrato: string; itemId: number }[] } {
  const sinCodigoData: { contrato: string; itemId: number }[] = [];
  const res: ContratoTarifario[] = [];

  for (const c of contratos) {
    if (c.estado !== 'activo' || c.cliente?.estado !== 'activo') continue;
    const items: ContratoTarifario['items'] = [];
    for (const item of c.items ?? []) {
      if (item.estado !== 'activo') continue;
      const servicios = item.conceptos.map((cc) => cc.concepto?.codigoData ?? null);
      if (!servicios.length || servicios.some((s) => s == null)) {
        sinCodigoData.push({ contrato: c.codigo ?? c.nombreContrato, itemId: item.id });
        continue;
      }
      const t = tarifasPorItem.get(item.id);
      const tieneTarifa = t && (t.escalones.length || t.minimo || t.valorFijo != null || t.recargo);
      const tarifa: TarifaEntrada | undefined = tieneTarifa
        ? {
            escalones: t.escalones,
            valorMinimo: t.minimo?.valorMinimo ?? null,
            volumenTopeMinimo: t.minimo?.volumenTope ?? null,
            valorFijo: t.valorFijo,
            recargoFijo: t.recargo || null,
          }
        : undefined;
      items.push({
        servicios: servicios as string[],
        modeloCobro: item.modeloCobro,
        moneda: item.moneda ?? 'COP',
        tarifasPorAnio: tarifa ? { [anio]: tarifa } : {},
        itemId: item.id,
      });
    }
    res.push({
      contratoId: c.codigo ?? `BD-${c.id}`,
      nit: c.cliente.nit,
      razonSocial: c.cliente.razonSocial,
      segmento: c.segmento ?? 'CORPORATIVO',
      vigenciaDesde: c.vigenciaDesde,
      vigenciaHasta: c.vigenciaHasta,
      moneda: 'COP',
      perfil: { rtefte: c.cliente.tasaRtefte, rteiva: c.cliente.tasaRteiva, rteica: c.cliente.tasaRteica },
      items,
      clienteId: c.cliente.id,
      grupo: grupos.get(c.id),
    });
  }
  return { contratos: res, sinCodigoData };
}

export interface PlanGuardado {
  /** Liquidaciones a escribir (nuevas o que reemplazan un 'calculado'/'rechazado'). */
  escribir: { liquidacion: Liquidacion; existente: PreLiquidado | null }[];
  /** Ya aprobados/facturados: no se tocan. `cambio` = el nuevo cálculo da otro total. */
  bloqueados: { existente: PreLiquidado; cambio: boolean }[];
  /** 'calculado' de una corrida anterior que ya no corresponde a ningún item liquidado. */
  borrar: PreLiquidado[];
}

/**
 * Qué hacer con los pre-liquidados del periodo frente a una nueva corrida.
 * Regla del gate humano: lo aprobado o facturado nunca lo sobrescribe el motor;
 * si el nuevo cálculo difiere, se informa para que un humano decida.
 * Los rechazados se conservan si el item ya no se liquida (son evidencia).
 */
export function planificarGuardado(existentes: PreLiquidado[], liquidaciones: Liquidacion[]): PlanGuardado {
  const porItem = new Map(existentes.map((p) => [p.contratoItemId, p]));
  const plan: PlanGuardado = { escribir: [], bloqueados: [], borrar: [] };
  const vistos = new Set<number>();

  for (const l of liquidaciones) {
    if (l.itemId == null) throw new Error(`Liquidación sin itemId (${l.contratoId}): los contratos deben venir de la BD`);
    vistos.add(l.itemId);
    const existente = porItem.get(l.itemId) ?? null;
    if (existente && (existente.estado === 'aprobado' || existente.estado === 'facturado')) {
      // USD: se compara en dólares (la TRM estimada cambia cada día y no es un cambio del cobro).
      const cambio = l.usd
        ? Number(existente.subtotalMoneda) !== l.usd.resultado.subtotal
        : Number(existente.totalFactura) !== l.resultado.factura.total;
      plan.bloqueados.push({ existente, cambio });
    } else {
      plan.escribir.push({ liquidacion: l, existente });
    }
  }
  for (const p of existentes) {
    if (!vistos.has(p.contratoItemId) && p.estado === 'calculado') plan.borrar.push(p);
  }
  return plan;
}
