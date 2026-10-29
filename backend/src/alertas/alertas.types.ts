export type TipoAlerta =
  | 'desactualizado'
  | 'tarifa_incompleta'
  | 'nit_pendiente'
  | 'volumen_sin_enlazar'
  | 'vencido'
  | 'por_vencer'
  | 'caida_general'
  | 'variacion_diaria'
  | 'variacion_mensual';

export type SeveridadAlerta = 'critica' | 'alta' | 'media';

export interface Alerta {
  tipo: TipoAlerta;
  severidad: SeveridadAlerta;
  clienteId: number;
  clienteNombre: string;
  contratoId?: number;
  contratoNombre?: string;
  mensaje: string;
  detalle?: Record<string, unknown>;
  /** Solo alertas de variación: identifica la alerta para marcarla como revisada. */
  clave?: string;
  /** Revisión de Contabilidad (solo sale si se piden también las revisadas). */
  revision?: { motivo: string; nota: string | null; usuario: string; fecha: Date };
  /** Ya revisada, pero con días nuevos fuera de lo normal desde la revisión. */
  diasNuevos?: string[];
}

/**
 * Una alerta de variación revisada deja de salir; la de días vuelve si hay
 * días fuera de lo normal que no estaban cuando se revisó (mes en curso).
 */
export function diasSinRevisar(alerta: Pick<Alerta, 'tipo' | 'detalle'>, diasRevisados: string[]): string[] {
  if (alerta.tipo !== 'variacion_diaria') return [];
  const dias = ((alerta.detalle?.dias as { fecha: string }[] | undefined) ?? []).map((d) => d.fecha);
  const vistos = new Set(diasRevisados);
  return dias.filter((f) => !vistos.has(f));
}

export interface ResumenAlertas {
  total: number;
  porTipo: Record<TipoAlerta, number>;
  porSeveridad: Record<SeveridadAlerta, number>;
}

export interface AlertasResultado {
  resumen: ResumenAlertas;
  alertas: Alerta[];
}
