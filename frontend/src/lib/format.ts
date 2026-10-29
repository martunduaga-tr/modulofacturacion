/** Formato de moneda colombiana: $ 12.417.318 (sin decimales por defecto). */
export function formatearMoneda(valor: number | null | undefined, decimales = 0): string {
  if (valor === null || valor === undefined) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}

/** Número con separador de miles: 243.936 */
/** Dólares con 2 decimales: "US$ 5.273,90". */
export function formatearUsd(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  return `US$ ${new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor)}`;
}

export function formatearNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  return new Intl.NumberFormat('es-CO').format(valor);
}

/** Fracción a porcentaje: 0.19 -> "19 %" (usado por parámetros/tasas tributarias). */
export function formatearPorcentaje(valor: number | null | undefined, decimales = 3): string {
  if (valor === null || valor === undefined) return '—';
  return `${(valor * 100).toLocaleString('es-CO', { maximumFractionDigits: decimales })} %`;
}

/** Fecha YYYY-MM-DD -> 05 jun 2026 */
export function formatearFecha(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const d = new Date(fecha.length <= 10 ? `${fecha}T00:00:00` : fecha);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

export function rangoVigencia(desde: string | null, hasta: string | null): string {
  if (!desde && !hasta) return 'Sin vigencia definida';
  return `${formatearFecha(desde)} — ${hasta ? formatearFecha(hasta) : 'indefinida'}`;
}

const ETIQUETA_MODELO: Record<string, string> = {
  volumen_escalonado: 'Escalonado',
  minimo_garantizado: 'Mínimo garantizado',
  fijo_mensual: 'Fijo mensual',
  bolsa: 'Bolsa',
  plan_anual: 'Plan anual (Express)',
};

export function etiquetaModelo(modelo: string): string {
  return ETIQUETA_MODELO[modelo] ?? modelo;
}

const ETIQUETA_TIPO_ALERTA: Record<string, string> = {
  desactualizado: 'Desactualizado',
  tarifa_incompleta: 'Tarifa incompleta',
  nit_pendiente: 'NIT pendiente',
  volumen_sin_enlazar: 'Volumen sin enlazar',
  vencido: 'Vencido',
  por_vencer: 'Por vencer',
  caida_general: 'Caída general',
  variacion_diaria: 'Variación en días',
  variacion_mensual: 'Variación del mes',
};

/** Motivos con que Contabilidad cierra una alerta de variación (coe.alertas_revision). */
export const MOTIVOS_REVISION: Record<string, string> = {
  festivo_o_cierre: 'Festivo o cierre del cliente',
  cliente_confirmo: 'El cliente confirmó el volumen',
  error_data: 'Error de Data o de la plataforma (se reporta)',
  ajuste_factura: 'Se ajusta la factura',
  sin_novedad: 'Revisado, sin novedad',
  otro: 'Otro',
};

export function etiquetaTipoAlerta(tipo: string): string {
  return ETIQUETA_TIPO_ALERTA[tipo] ?? tipo;
}

/** Retenciones del cliente para mostrar: "RteFte 3,5% · RteIVA 15% · RteICA 0%", o null si falta alguna. */
export function textoRetenciones(c: { tasaRtefte: number | null; tasaRteiva: number | null; tasaRteica: number | null }): string | null {
  if (c.tasaRtefte == null || c.tasaRteiva == null || c.tasaRteica == null) return null;
  const pct = (v: number) => `${String(Math.round(v * 1_000_000) / 10_000).replace('.', ',')}%`;
  return `RteFte ${pct(c.tasaRtefte)} · RteIVA ${pct(c.tasaRteiva)} · RteICA ${pct(c.tasaRteica)}`;
}

const SEGMENTOS: Record<string, string> = { CORPORATIVO: 'Corporativo', EXPRESS: 'Express', AMBOS: 'Corporativo y Express' };
export const textoSegmento = (s: string | null | undefined) => SEGMENTOS[s ?? 'CORPORATIVO'] ?? s ?? '';

/** Por qué un volumen de Data no se pudo cobrar, y qué hacer (pantalla Empalme). */
export const MOTIVO_PENDIENTE: Record<string, { etiqueta: string; accion: string }> = {
  NIT_SIN_CONTRATO: { etiqueta: 'NIT sin contrato', accion: 'Cargar el contrato del cliente en el tarifario o en Contratos.' },
  CONTRATO_NO_VIGENTE: { etiqueta: 'Contrato no vigente', accion: 'Revisar las fechas de vigencia o la renovación del contrato.' },
  SERVICIO_SIN_TARIFA: { etiqueta: 'Servicio sin tarifa', accion: 'El cliente usó un servicio que su contrato no incluye: definir la regla de cobro.' },
  SERVICIO_EN_VARIOS_CONTRATOS: { etiqueta: 'Servicio en varios contratos', accion: 'El servicio está en más de un contrato vigente del cliente: dejar uno solo.' },
  ERROR_CALCULO: { etiqueta: 'Error de cálculo', accion: 'La tarifa está incompleta para el volumen o el año (ver detalle).' },
};

export function etiquetaMotivo(motivo: string): string {
  return MOTIVO_PENDIENTE[motivo]?.etiqueta ?? motivo;
}
