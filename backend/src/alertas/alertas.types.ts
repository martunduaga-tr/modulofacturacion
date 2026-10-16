export type TipoAlerta =
  | 'desactualizado'
  | 'tarifa_incompleta'
  | 'nit_pendiente'
  | 'volumen_sin_enlazar'
  | 'vencido'
  | 'por_vencer';

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
