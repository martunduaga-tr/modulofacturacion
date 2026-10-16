export type EstadoContrato = 'activo' | 'inactivo';
export type ModeloCobro = 'volumen_escalonado' | 'minimo_garantizado' | 'fijo_mensual' | 'bolsa';
export type Rol = 'administrador' | 'editor' | 'lector';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Cliente {
  id: number;
  nit: string;
  dv: string | null;
  razonSocial: string;
  correoContacto: string | null;
  estado: 'activo' | 'retirado';
  observaciones: string | null;
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

export interface ContratoItem {
  id: number;
  modeloCobro: ModeloCobro;
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
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  estado: EstadoContrato;
  observaciones: string | null;
  cliente: Cliente;
  items?: ContratoItem[];
}

export interface AuthUser {
  username: string;
  nombre: string;
  rol: Rol;
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
  cliente: Cliente;
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
