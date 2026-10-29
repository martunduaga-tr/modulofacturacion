export type EstadoContrato = 'activo' | 'inactivo';
export type ModeloCobro = 'volumen_escalonado' | 'minimo_garantizado' | 'fijo_mensual' | 'bolsa' | 'plan_anual';
export type Rol = 'administrador' | 'editor' | 'lector' | 'comercial';
export type SegmentoContrato = 'CORPORATIVO' | 'EXPRESS';
/** Resumen de los contratos activos del cliente; no se edita. */
export type SegmentoCliente = SegmentoContrato | 'AMBOS';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Hojas de negocio para la línea de factura ("Emisión - Recepción" = tarifa conjunta). */
export const CLASIFICADORES = ['Emisión', 'Recepción', 'Emisión - Recepción', 'Nómina', 'Doc Soporte', 'iDocumentos', 'ISALUD', 'iSoat', 'iSeguros', 'iRecaudo'] as const;
export type Clasificador = (typeof CLASIFICADORES)[number];

/** Texto propio del cliente en la línea de factura: "<clasificador> - <comentario>". */
export interface ComentarioFactura {
  id: number;
  clienteId: number;
  clasificador: Clasificador;
  comentario: string;
  /** historial = precargado de sus facturas; manual = lo escribió Contabilidad. */
  origen: 'historial' | 'manual';
}

export interface Cliente {
  id: number;
  nit: string;
  dv: string | null;
  razonSocial: string;
  correoContacto: string | null;
  estado: 'activo' | 'retirado';
  observaciones: string | null;
  segmento: SegmentoCliente;
  /** Retenciones que practica el cliente (fracción). null = sin definir. */
  tasaRtefte: number | null;
  tasaRteiva: number | null;
  tasaRteica: number | null;
  /** Solo en el listado (GET /clientes). */
  contratosCount?: number;
  /** Solo en la ficha (GET /clientes/:id): contratos con items→conceptos anidados. */
  contratos?: Contrato[];
}

export interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  estado: 'activo' | 'inactivo';
}

export interface ConceptoFacturable {
  id: number;
  productoId: number;
  codigo: string;
  nombre: string;
  estado: 'activo' | 'inactivo';
}

export interface TarifaEscalon {
  id: number;
  contratoItemId: number;
  anio: number;
  volumenDesde: number;
  volumenHasta: number;
  precioUnitario: number;
  ipcAplicado: number | null;
}

export interface MinimoGarantizado {
  id: number;
  contratoItemId: number;
  anio: number;
  valorMinimo: number;
  /** Tope de la banda que cubre valorMinimo (franquicia): por debajo o igual, se cobra solo el monto plano. */
  volumenTope: number | null;
}

export interface TarifaFija {
  id: number;
  contratoItemId: number;
  anio: number;
  valorFijo: number;
}

export interface RecargoFijo {
  id: number;
  contratoItemId: number;
  anio: number;
  concepto: string;
  valor: number;
}

export interface ItemConcepto {
  id: number;
  productoId: number;
  conceptoId: number;
  producto: Producto;
  concepto: ConceptoFacturable;
}

/** Moneda de la tarifa: COP por defecto; USD pasa a pesos con la TRM del día de la factura. */
export type Moneda = 'COP' | 'USD';

export interface ContratoItem {
  id: number;
  modeloCobro: ModeloCobro;
  moneda: Moneda;
  /** Servicios agrupados por el item. Lo normal es 1; un item con 2+ es "híbrido":
   *  sus volúmenes se suman y se liquidan contra una sola tabla de tarifa. */
  conceptos: ItemConcepto[];
  escalones: TarifaEscalon[];
  minimos: MinimoGarantizado[];
  tarifasFijas: TarifaFija[];
  recargos: RecargoFijo[];
}

export interface Contrato {
  id: number;
  nombreContrato: string;
  /** Corporativo: número del contrato firmado. Express: NIT-EXP-SERVICIO, lo genera el sistema. */
  codigo: string | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  estado: EstadoContrato;
  /** Express = suscripción anual de un servicio con su propio tope. */
  segmento: SegmentoContrato;
  observaciones: string | null;
  cliente: Cliente;
  items?: ContratoItem[];
}

export interface AuthUser {
  username: string;
  nombre: string;
  rol: Rol;
  /** Clave temporal puesta por el administrador: solo puede cambiarla. */
  debeCambiarClave?: boolean;
}

export interface ParametroGlobal {
  id: number;
  clave: string;
  valor: number;
  vigenciaDesde: string;
  descripcion: string | null;
}

export interface Usuario {
  id: number;
  username: string;
  nombre: string;
  email: string | null;
  rol: Rol;
  estado: 'activo' | 'inactivo';
  debeCambiarClave: boolean;
  fechaCreacion: string;
}

export interface LineaFacturacion {
  id: number;
  clienteId: number;
  contratoItemId: number | null;
  cuentaContable: string | null;
  unidadNegocio: string | null;
  plazoDias: number | null;
  recibeFra: string | null;
  correoContacto: string | null;
  centroCosto: string | null;
  subCentroCosto: string | null;
  descCentroCosto: string | null;
  referencia: string | null;
  codIfactura: string | null;
  codSiigo: string | null;
  concepto: string | null;
  descripcionFactura: string | null;
  observaciones: string | null;
  estado: 'activo' | 'inactivo';
  cliente: Cliente;
  contratoItem?: ContratoItem | null;
}

export type EstadoPreLiquidado = 'calculado' | 'aprobado' | 'rechazado' | 'facturado';

export interface PreLiquidado {
  id: number;
  anio: number;
  mes: number;
  volumen: number;
  modeloCobro: ModeloCobro;
  anioTarifa: number;
  tarifaUnitaria: number | null;
  recargoFijo: number;
  subtotal: number;
  tasaIva: number;
  iva: number;
  total: number;
  tasaRtefte: number;
  baseRtefte: number;
  rtefte: number;
  tasaRteica: number;
  baseRteica: number;
  rteica: number;
  tasaRteiva: number;
  baseRteiva: number;
  rteiva: number;
  tasaAutorretencion: number;
  autorretencion: number;
  valorCartera: number;
  estado: EstadoPreLiquidado;
  anomalias: string | null;
  usuarioAprobo: string | null;
  fechaAprobacion: string | null;
  /** Valores como los imprime la factura electrónica (pesos enteros). Null en cálculos anteriores al empalme. */
  subtotalFactura: number | null;
  ivaFactura: number | null;
  totalFactura: number | null;
  usuarioRechazo: string | null;
  fechaRechazo: string | null;
  motivoRechazo: string | null;
  desglose: string | null;
  /** USD: los valores de arriba están en pesos con `trm`; estimada hasta que se factura. */
  moneda: Moneda;
  subtotalMoneda: number | null;
  trm: number | null;
  fechaTrm: string | null;
  trmDefinitiva: boolean;
  fechaFactura: string | null;
  usuarioFacturo: string | null;
  cliente: Cliente;
}

export interface TrmDia {
  fecha: string;
  valor: number;
  fuente: 'datos.gov.co' | 'manual';
}

// ---- Empalme Data ↔ Contabilidad ------------------------------------------

export interface ErrorTarifario {
  fila: number;
  contratoId: string;
  mensaje: string;
}

export interface ResultadoImportacion {
  contratosCreados: number;
  contratosActualizados: number;
  clientesCreados: number;
  /** Contratos en espera porque el cliente no tiene retenciones (el cliente sí se crea). */
  esperandoRetenciones: number;
  /** Servicios que Data no mide: quedan en el contrato, pero se cobran a mano. */
  serviciosNoMedidos: string[];
  errores: ErrorTarifario[];
}

export type MotivoPendiente =
  | 'NIT_SIN_CONTRATO'
  | 'CONTRATO_NO_VIGENTE'
  | 'SERVICIO_SIN_TARIFA'
  | 'SERVICIO_EN_VARIOS_CONTRATOS'
  | 'ERROR_CALCULO';

export interface ResumenLiquidacion {
  periodo: string;
  origen: 'csv' | 'bigquery' | 'bigquery_programado';
  filasBigQuery: number;
  nits: number;
  transacciones: number;
  ajustesNegativos: { fecha: string; nit: string; servicio: string; cantidad: number }[];
  /** Hrs_Dev (iSoat) del periodo y si se excluyó del cobro en esta liquidación. */
  hrsDev: { cantidad: number; excluido: boolean };
  liquidados: number;
  transaccionesLiquidadas: number;
  totalFacturado: number;
  bloqueados: number;
  aprobadosConCambio: { preLiquidadoId: number; cliente: string; totalAprobado: number; totalNuevo: number }[];
  pendientes: Partial<Record<MotivoPendiente, { registros: number; transacciones: number }>>;
  itemsSinCodigoData: { contrato: string; itemId: number }[];
}

export interface EstadoBigQuery {
  configurado: boolean;
  vista: string;
  consultaPropia: boolean;
}

export interface EmpalmePendiente {
  id: number;
  anio: number;
  mes: number;
  nit: string;
  servicio: string;
  cantidad: number;
  motivo: MotivoPendiente;
  detalle: string | null;
}

export interface SugerenciaReconciliacion {
  pendiente: { id: number; razonSocial: string; nit: string };
  contratos: number;
  candidatos: { id: number; razonSocial: string; nit: string; score: number }[];
}

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
  /** Solo alertas de variación: para marcarlas como revisadas. */
  clave?: string;
  revision?: { motivo: string; nota: string | null; usuario: string; fecha: string };
  /** Revisada, pero con días nuevos fuera de lo normal desde entonces. */
  diasNuevos?: string[];
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

export interface AuditoriaCambio {
  id: string;
  tabla: string;
  registroId: number;
  usuario: string;
  accion: 'INSERT' | 'UPDATE' | 'DELETE';
  valorAnterior: string | null;
  valorNuevo: string | null;
  fecha: string;
}

// ---- Express ----------------------------------------------------------------

export type TipoSolicitud = 'NUEVO' | 'RENOVACION' | 'COBRO_ADICIONAL';
export type EstadoSolicitud = 'enviada' | 'correccion' | 'aprobada' | 'rechazada';

export interface SuscripcionExpress {
  contratoId: number;
  codigo: string | null;
  clienteId: number;
  nit: string;
  razonSocial: string;
  servicio: string;
  tope: number | null;
  valorAnual: number | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  diasParaVencer: number | null;
  consumoCiclo: number;
  solicitudPendiente: { id: number; tipo: TipoSolicitud; estado: EstadoSolicitud } | null;
}

export interface SolicitudExpress {
  id: number;
  tipo: TipoSolicitud;
  estado: EstadoSolicitud;
  contratoId: number | null;
  nit: string;
  razonSocial: string;
  servicio: string;
  tope: number | null;
  valorAnual: number | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  tasaRtefte: number | null;
  tasaRteiva: number | null;
  tasaRteica: number | null;
  cantidadAdicional: number | null;
  precioAdicional: number | null;
  noRenueva: boolean;
  observaciones: string | null;
  adjuntoNombre: string | null;
  usuarioCreo: string;
  fechaCreacion: string;
  usuarioModifico: string | null;
  fechaModificacion: string | null;
  usuarioReviso: string | null;
  fechaRevision: string | null;
  comentarioRevision: string | null;
}

export interface CobroExpress {
  id: number;
  solicitudId: number;
  contratoId: number;
  concepto: 'PLAN_ANUAL' | 'ADICIONALES';
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  subtotal: number;
  iva: number;
  total: number;
  rtefte: number;
  rteiva: number;
  rteica: number;
  estado: 'por_facturar' | 'facturado';
  fechaCreacion: string;
  cliente: Cliente;
}

// ---- Variaciones de comportamiento (gráfica del cliente) ----
export interface DiaVariacion {
  fecha: string;
  cantidad: number;
  esperado: number | null;
  marca: 'caida' | 'cero' | 'alza' | null;
  festivo: string | null;
  general: boolean;
}

export interface MesVela {
  periodo: string;
  total: number;
  apertura: number;
  cierre: number;
  minimo: number;
  maximo: number;
  completo: boolean;
}

export interface SerieCliente {
  cliente: { id: number; nit: string; razonSocial: string };
  servicios: { servicio: string; total: number }[];
  servicio: string | null;
  cobertura: { desde: string; hasta: string } | null;
  dias: DiaVariacion[];
  meses: MesVela[];
  variaciones: { servicio: string; periodo: string; delta: number; variacion: number; impactoPesos: number | null }[];
  mensuales: { servicio: string; periodo: string; total: number; base: number; variacion: number; impactoPesos: number | null }[];
}

export interface ResultadoHistorico {
  periodos: { periodo: string; filas: number; transacciones: number; hasta: string }[];
  errores: { periodo: string; mensaje: string }[];
}
