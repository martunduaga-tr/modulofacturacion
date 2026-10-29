import type { ModeloCobro } from '../contratos/entities/contrato-item.entity';

/** Un escalón de tarifa (de la tabla tarifa_escalones), para el año a facturar. */
export interface EscalonTarifa {
  volumenDesde: number;
  volumenHasta: number;
  precioUnitario: number;
}

/** Tarifa de un item para el año del periodo (lo que produce Etapa 1). */
export interface TarifaEntrada {
  escalones?: EscalonTarifa[];
  valorMinimo?: number | null;
  /** Tope de la banda que cubre valorMinimo (franquicia). Ver minimo_garantizado. */
  volumenTopeMinimo?: number | null;
  valorFijo?: number | null;
  /** Suma de recargos fijos del item para el año (ej. MANTENIMIENTO). Se suma al subtotal, cualquiera sea el modelo. */
  recargoFijo?: number | null;
}

/** Tasas tributarias (de parametros_globales). Como fracción: 0.19 = 19%. */
export interface TasasTributarias {
  iva: number;
  rtefte: number;
  rteica: number;
  rteiva: number;
  autorretencion: number;
}

/** Entrada completa del cálculo de un item para un periodo. */
export interface EntradaCalculo {
  modeloCobro: ModeloCobro;
  volumen: number;
  anioTarifa: number;
  tarifa: TarifaEntrada;
  tasas: TasasTributarias;
}

/** Un valor tributario con su tasa y base (trazabilidad). */
export interface ComponenteTributario {
  tasa: number;
  base: number;
  valor: number;
}

/** Resultado del cálculo, con el desglose completo (trazabilidad fiscal). */
export interface ResultadoCalculo {
  modeloCobro: ModeloCobro;
  volumen: number;
  anioTarifa: number;
  escalonUsado: EscalonTarifa | null;
  tarifaUnitaria: number | null;
  /** Recargo fijo sumado al subtotal (0 si el item no tiene). Trazabilidad de B2. */
  recargoFijo: number;
  subtotal: number;
  iva: ComponenteTributario;
  total: number;
  rtefte: ComponenteTributario;
  rteica: ComponenteTributario;
  rteiva: ComponenteTributario;
  autorretencion: ComponenteTributario; // informativa: NO se resta de la cartera
  valorCartera: number;
  /** Valores tal como se imprimen en la factura electrónica (ver MotorCalculoService.calcular). */
  factura: ValoresFactura;
}

/**
 * La factura electrónica muestra subtotal e IVA en pesos enteros; las
 * retenciones van con 2 decimales calculadas sobre los valores sin redondear
 * a pesos (verificado contra las facturas de julio 2026, FE-24347..FE-24469).
 */
export interface ValoresFactura {
  subtotal: number;
  iva: number;
  total: number;
  /** total − RteFte − RteICA − RteIVA: lo que el cliente efectivamente paga. */
  valorCartera: number;
}

export type CodigoErrorCalculo =
  | 'VOLUMEN_INVALIDO'
  | 'SIN_ESCALON'
  | 'SIN_MINIMO'
  | 'SIN_TOPE_MINIMO'
  | 'SIN_FIJO'
  | 'MODELO_SIN_COBRO_MENSUAL';

/** Error de cálculo tipado: el motor nunca calcula un número silenciosamente mal. */
export class ErrorCalculo extends Error {
  constructor(
    public readonly codigo: CodigoErrorCalculo,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorCalculo';
  }
}
