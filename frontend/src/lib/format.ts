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
};

export function etiquetaTipoAlerta(tipo: string): string {
  return ETIQUETA_TIPO_ALERTA[tipo] ?? tipo;
}
