import type { EntityManager } from 'typeorm';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Cliente, SegmentoCliente, SegmentoContrato } from './entities/cliente.entity';

/** CORPORATIVO, EXPRESS o AMBOS según los contratos; null si no tiene ninguno. */
export function resumirSegmento(segmentos: SegmentoContrato[]): SegmentoCliente | null {
  const distintos = new Set(segmentos);
  if (distintos.size === 0) return null;
  return distintos.size > 1 ? 'AMBOS' : segmentos[0];
}

/**
 * El segmento del cliente no se edita: se deriva de sus contratos activos
 * cada vez que uno se crea, se carga o cambia de estado. Sin contratos
 * activos se deja el que tenía.
 */
export async function recalcularSegmentoCliente(m: EntityManager, clienteId: number): Promise<void> {
  const activos = await m.find(Contrato, { where: { clienteId, estado: 'activo' }, select: { id: true, segmento: true } });
  const segmento = resumirSegmento(activos.map((c) => c.segmento));
  if (segmento) await m.update(Cliente, clienteId, { segmento });
}
