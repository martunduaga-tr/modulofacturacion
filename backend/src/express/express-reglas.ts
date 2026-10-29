import Decimal from 'decimal.js';
import { MotorCalculoService } from '../calculo/motor-calculo.service';
import type { ResultadoCalculo, TasasTributarias } from '../calculo/tipos';

/**
 * Reglas de las solicitudes Express (definidas con el usuario el 2026-10-21),
 * sin base de datos para poder probarlas:
 *
 *   NUEVO            cliente/suscripción nueva: plan + retenciones + PDF obligatorio
 *   RENOVACION       nuevo ciclo (con o sin cambio de tarifa) + PDF obligatorio;
 *                    puede traer los adicionales del ciclo que cierra
 *   COBRO_ADICIONAL  solo adicionales (ej. el cliente no renueva); PDF opcional
 *
 * Los adicionales los digita Comercial (cantidad × precio): varían por cliente.
 * El PDF es soporte para la revisión humana; el sistema no lo interpreta.
 */

export type TipoSolicitud = 'NUEVO' | 'RENOVACION' | 'COBRO_ADICIONAL';
export type EstadoSolicitud = 'enviada' | 'correccion' | 'aprobada' | 'rechazada';

export interface DatosSolicitud {
  tipo: TipoSolicitud;
  contratoId?: number | null;
  nit?: string | null;
  razonSocial?: string | null;
  servicio?: string | null;
  tope?: number | null;
  valorAnual?: number | null;
  vigenciaDesde?: string | null;
  vigenciaHasta?: string | null;
  tasaRtefte?: number | null;
  tasaRteiva?: number | null;
  tasaRteica?: number | null;
  cantidadAdicional?: number | null;
  precioAdicional?: number | null;
  noRenueva?: boolean;
  tieneAdjunto: boolean;
}

const definido = (v: unknown) => v !== null && v !== undefined && v !== '';

/** Errores de la solicitud según su tipo (vacío = válida). Mensajes para mostrarle a Comercial. */
export function validarSolicitud(d: DatosSolicitud): string[] {
  const e: string[] = [];
  const conPlan = d.tipo === 'NUEVO' || d.tipo === 'RENOVACION';

  if (d.tipo === 'NUEVO') {
    if (!definido(d.nit) || !/^\d+$/.test(String(d.nit))) e.push('NIT del cliente: solo números, sin dígito de verificación.');
    if (!definido(d.razonSocial)) e.push('Falta la razón social.');
    if (!definido(d.servicio)) e.push('Falta el servicio.');
    for (const [campo, v] of [['RteFte', d.tasaRtefte], ['RteIVA', d.tasaRteiva], ['RteICA', d.tasaRteica]] as const) {
      if (!definido(v)) e.push(`Falta la tasa de ${campo} del cliente (0 si no aplica).`);
      else if (v! < 0 || v! >= 1) e.push(`Tasa de ${campo} fuera de rango (use 0.035 para 3,5%).`);
    }
  } else if (!definido(d.contratoId)) {
    e.push('Seleccione la suscripción.');
  }

  if (conPlan) {
    if (!definido(d.tope) || d.tope! <= 0 || !Number.isInteger(d.tope)) e.push('El tope de documentos debe ser un entero mayor que 0.');
    if (!definido(d.valorAnual) || d.valorAnual! <= 0) e.push('El valor anual debe ser mayor que 0.');
    if (!definido(d.vigenciaDesde)) e.push('Falta la fecha de inicio del ciclo.');
    if (definido(d.vigenciaHasta) && definido(d.vigenciaDesde) && d.vigenciaHasta! < d.vigenciaDesde!) {
      e.push('La fecha de fin no puede ser anterior a la de inicio.');
    }
    if (!d.tieneAdjunto) e.push('Adjunte el PDF de soporte: es obligatorio para clientes nuevos y renovaciones.');
    if (d.noRenueva) e.push('"No renueva" solo aplica al cobro de adicionales.');
  }

  const hayCantidad = definido(d.cantidadAdicional);
  const hayPrecio = definido(d.precioAdicional);
  if (hayCantidad !== hayPrecio) e.push('Para cobrar adicionales indique la cantidad y el precio unitario.');
  if (hayCantidad && (d.cantidadAdicional! <= 0 || !Number.isInteger(d.cantidadAdicional))) e.push('La cantidad adicional debe ser un entero mayor que 0.');
  if (hayPrecio && d.precioAdicional! <= 0) e.push('El precio unitario adicional debe ser mayor que 0.');
  if (d.tipo === 'COBRO_ADICIONAL' && !hayCantidad) e.push('Indique la cantidad y el precio de los adicionales a cobrar.');

  return e;
}

/** Ciclo de 365 días: termina el día anterior al mismo día del año siguiente. */
export function vigenciaHastaPorDefecto(desde: string): string {
  const [a, m, d] = desde.split('-').map(Number);
  const fin = new Date(Date.UTC(a + 1, m - 1, d));
  fin.setUTCDate(fin.getUTCDate() - 1);
  return fin.toISOString().slice(0, 10);
}

export function diasParaVencer(hasta: string | null, hoy: Date): number | null {
  if (!hasta) return null;
  const [a, m, d] = hasta.split('-').map(Number);
  const inicioHoy = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((Date.UTC(a, m - 1, d) - inicioHoy) / 86_400_000);
}

/**
 * Consumo del ciclo en curso: suma los meses liquidados desde el mes en que
 * inicia la vigencia. Es referencia mensual (el empalme corre por mes), no un
 * corte exacto por día.
 */
export function consumoDelCiclo(consumos: { anio: number; mes: number; cantidad: number }[], vigenciaDesde: string | null): number {
  const desde = vigenciaDesde ? Number(vigenciaDesde.slice(0, 4)) * 100 + Number(vigenciaDesde.slice(5, 7)) : 0;
  return consumos.filter((c) => c.anio * 100 + c.mes >= desde).reduce((s, c) => s + c.cantidad, 0);
}

export interface CobroCalculado {
  concepto: 'PLAN_ANUAL' | 'ADICIONALES';
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  resultado: ResultadoCalculo;
}

/**
 * Cobros que genera una solicitud aprobada, calculados con el mismo motor
 * (monto fijo + cascada tributaria con las retenciones del cliente).
 */
export function cobrosDeSolicitud(
  s: Pick<DatosSolicitud, 'tipo' | 'servicio' | 'tope' | 'valorAnual' | 'vigenciaDesde' | 'vigenciaHasta' | 'cantidadAdicional' | 'precioAdicional'>,
  tasas: TasasTributarias,
  motor = new MotorCalculoService(),
): CobroCalculado[] {
  const anio = Number((s.vigenciaDesde ?? new Date().toISOString()).slice(0, 4));
  const fijo = (valor: number) =>
    motor.calcular({ modeloCobro: 'fijo_mensual', volumen: 0, anioTarifa: anio, tarifa: { valorFijo: valor }, tasas });
  const cobros: CobroCalculado[] = [];

  if (s.tipo !== 'COBRO_ADICIONAL') {
    cobros.push({
      concepto: 'PLAN_ANUAL',
      descripcion: `${s.tipo === 'NUEVO' ? 'Suscripción' : 'Renovación de suscripción'} anual ${s.servicio} hasta ${s.tope} documentos, del ${s.vigenciaDesde} al ${s.vigenciaHasta}`,
      cantidad: 1,
      valorUnitario: s.valorAnual!,
      resultado: fijo(s.valorAnual!),
    });
  }
  if (s.cantidadAdicional && s.precioAdicional) {
    // cantidad × precio en decimal exacto (nunca float); el motor redondea como la factura.
    const valor = new Decimal(s.cantidadAdicional).mul(s.precioAdicional).toNumber();
    cobros.push({
      concepto: 'ADICIONALES',
      descripcion: `${s.cantidadAdicional} documentos adicionales ${s.servicio} sobre el tope del plan`,
      cantidad: s.cantidadAdicional,
      valorUnitario: s.precioAdicional,
      resultado: fijo(valor),
    });
  }
  return cobros;
}
