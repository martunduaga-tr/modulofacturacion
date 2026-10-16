/**
 * Validación de tarifas en el cliente — refleja TarifasValidationService del backend
 * para dar feedback en vivo con los mismos mensajes. El backend revalida igual al guardar.
 */
import type { ModeloCobro } from './types';

export interface EscalonInput {
  volumenDesde: number | '';
  volumenHasta: number | '';
  precioUnitario: number | '';
}

export interface RecargoInput {
  concepto: string;
  valor: number | '';
}

export interface ResultadoEscalones {
  errores: string[];
  filasMalas: Set<number>;
}

const esNum = (v: number | '') => v !== '' && !Number.isNaN(Number(v));

/** Valida un grupo de escalones de un mismo año: precio>0, desde<=hasta, contiguo sin solape/huecos. */
export function validarEscalones(escalones: EscalonInput[]): ResultadoEscalones {
  const errores: string[] = [];
  const filasMalas = new Set<number>();

  if (escalones.length === 0) {
    return { errores: ['Agrega al menos un escalón.'], filasMalas };
  }

  // Validación por fila
  escalones.forEach((e, i) => {
    if (!esNum(e.volumenDesde) || !esNum(e.volumenHasta) || !esNum(e.precioUnitario)) {
      errores.push(`El escalón ${i + 1} tiene campos vacíos.`);
      filasMalas.add(i);
      return;
    }
    if (Number(e.precioUnitario) <= 0) {
      errores.push(`El escalón ${i + 1}: el precio debe ser mayor que 0.`);
      filasMalas.add(i);
    }
    if (Number(e.volumenDesde) > Number(e.volumenHasta)) {
      errores.push(`El escalón ${i + 1}: "desde" (${e.volumenDesde}) no puede ser mayor que "hasta" (${e.volumenHasta}).`);
      filasMalas.add(i);
    }
  });

  // Si hay filas incompletas, no seguimos con solape/huecos (ruido)
  if (filasMalas.size > 0) return { errores, filasMalas };

  // Orden y cobertura contigua
  const indexado = escalones.map((e, i) => ({ i, desde: Number(e.volumenDesde), hasta: Number(e.volumenHasta) }));
  const ordenado = [...indexado].sort((a, b) => a.desde - b.desde);
  for (let k = 1; k < ordenado.length; k++) {
    const prev = ordenado[k - 1];
    const cur = ordenado[k];
    if (cur.desde <= prev.hasta) {
      errores.push(`Los escalones se solapan: uno termina en ${prev.hasta} y el siguiente empieza en ${cur.desde}.`);
      filasMalas.add(prev.i);
      filasMalas.add(cur.i);
    } else if (cur.desde !== prev.hasta + 1) {
      errores.push(`Hay un hueco entre ${prev.hasta} y ${cur.desde}. Los escalones deben ser contiguos.`);
      filasMalas.add(prev.i);
      filasMalas.add(cur.i);
    }
  }

  return { errores, filasMalas };
}

/** Recargos fijos: valor>0, concepto no vacío, sin conceptos repetidos (cualquier modelo, opcional). */
export function validarRecargos(recargos: RecargoInput[]): string[] {
  const errores: string[] = [];
  recargos.forEach((r, i) => {
    if (!r.concepto.trim()) errores.push(`El recargo ${i + 1} necesita un concepto (ej. "MANTENIMIENTO").`);
    if (!esNum(r.valor) || Number(r.valor) <= 0) errores.push(`El recargo "${r.concepto || i + 1}": el valor debe ser mayor que 0.`);
  });
  const conceptos = recargos.map((r) => r.concepto.trim().toUpperCase()).filter(Boolean);
  const repetido = conceptos.find((c, i) => conceptos.indexOf(c) !== i);
  if (repetido) errores.push(`El recargo "${repetido}" está repetido.`);
  return errores;
}

/** Valida la tarifa de un item completo según su modelo. */
export function validarItemTarifa(
  modelo: ModeloCobro | '',
  escalones: EscalonInput[],
  valorMinimo: number | '',
  volumenTopeMinimo: number | '',
  valorFijo: number | '',
  recargos: RecargoInput[] = [],
): string[] {
  if (!modelo) return ['Selecciona el modelo de cobro.'];

  const erroresRecargos = validarRecargos(recargos);

  if (modelo === 'fijo_mensual') {
    if (!esNum(valorFijo) || Number(valorFijo) <= 0) return ['Ingresa un valor fijo mayor que 0.', ...erroresRecargos];
    return erroresRecargos;
  }

  // escalonado, bolsa y mínimo necesitan escalones válidos
  const { errores } = validarEscalones(escalones);
  const out = [...errores];
  if (modelo === 'minimo_garantizado') {
    if (!esNum(valorMinimo) || Number(valorMinimo) <= 0) {
      out.push('El modelo mínimo garantizado requiere un valor mínimo mayor que 0.');
    }
    if (!esNum(volumenTopeMinimo) || Number(volumenTopeMinimo) <= 0) {
      out.push('El modelo mínimo garantizado requiere el tope de la banda que cubre (volumen hasta el que aplica el monto plano).');
    } else if (errores.length === 0 && escalones.length > 0) {
      const minDesde = Math.min(...escalones.map((e) => Number(e.volumenDesde)));
      if (minDesde !== Number(volumenTopeMinimo) + 1) {
        out.push(`El primer escalón debe empezar en tope + 1 (${Number(volumenTopeMinimo) + 1}), pero empieza en ${minDesde}.`);
      }
    }
  }
  return [...out, ...erroresRecargos];
}
