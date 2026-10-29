import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import type { ModeloCobro } from '../contratos/entities/contrato-item.entity';
import {
  EntradaCalculo,
  ErrorCalculo,
  EscalonTarifa,
  ResultadoCalculo,
  TarifaEntrada,
  TasasTributarias,
} from './tipos';

/**
 * Motor de cálculo DETERMINÍSTICO. Convierte volumen + tarifa en el monto a
 * facturar, con toda la cascada tributaria. Nunca lo toca un LLM.
 *
 * 4 modelos de cobro: volumen_escalonado, minimo_garantizado (franquicia,
 * ver calcularMinimoGarantizado), fijo_mensual y bolsa (paquete plano por
 * banda, ver calcularSubtotal). Cualquiera de los 4 puede además tener un
 * recargoFijo (ej. MANTENIMIENTO) que se suma siempre al subtotal.
 *
 * Política de redondeo: montos a 2 decimales, ROUND_HALF_UP (redondeo comercial).
 * Toda la aritmética usa Decimal (nunca float) para exactitud fiscal.
 * La cartera se calcula a partir de las retenciones ya redondeadas, como en el
 * Excel, para reproducir exactamente lo que hoy se factura.
 */
@Injectable()
export class MotorCalculoService {
  private static readonly DECIMALES = 2;

  private redondear(d: Decimal): Decimal {
    return d.toDecimalPlaces(MotorCalculoService.DECIMALES, Decimal.ROUND_HALF_UP);
  }

  /** Escalón donde cae el volumen (desde <= volumen <= hasta). null si no hay. */
  seleccionarEscalon(volumen: number, escalones: EscalonTarifa[] | undefined): EscalonTarifa | null {
    if (!escalones || escalones.length === 0) return null;
    return escalones.find((e) => volumen >= e.volumenDesde && volumen <= e.volumenHasta) ?? null;
  }

  /** Subtotal según el modelo de cobro. Devuelve también el escalón y la tarifa usados. */
  private calcularSubtotal(
    modelo: ModeloCobro,
    volumen: number,
    tarifa: TarifaEntrada,
  ): { subtotal: Decimal; escalonUsado: EscalonTarifa | null; tarifaUnitaria: Decimal | null } {
    if (modelo === 'plan_anual') {
      // Express: el plan se cobra solo por solicitud aprobada (renovación), nunca por volumen del mes.
      throw new ErrorCalculo('MODELO_SIN_COBRO_MENSUAL', 'El plan anual Express no se liquida por mes.');
    }

    if (modelo === 'fijo_mensual') {
      if (tarifa.valorFijo == null) {
        throw new ErrorCalculo('SIN_FIJO', 'El item es fijo_mensual pero no tiene valor fijo para el año.');
      }
      return { subtotal: this.redondear(new Decimal(tarifa.valorFijo)), escalonUsado: null, tarifaUnitaria: null };
    }

    if (modelo === 'minimo_garantizado') {
      return this.calcularMinimoGarantizado(volumen, tarifa);
    }

    if (modelo === 'volumen_escalonado' && volumen === 0) {
      // Sin transacciones no hay nada que multiplicar (0 × cualquier tarifa = 0). Llega aquí cuando el
      // item tiene un recargo fijo (ej. mantenimiento de SAN CARLOS), que se cobra aunque no haya volumen.
      return { subtotal: new Decimal(0), escalonUsado: null, tarifaUnitaria: null };
    }

    const escalon = this.seleccionarEscalon(volumen, tarifa.escalones);
    if (!escalon) {
      throw new ErrorCalculo(
        'SIN_ESCALON',
        `No hay escalón para el volumen ${volumen} en el año de la tarifa.`,
      );
    }
    const precio = new Decimal(escalon.precioUnitario);

    if (modelo === 'bolsa') {
      // Paquete plano por banda: se cobra precioUnitario tal cual, sin
      // multiplicar por volumen (a diferencia de volumen_escalonado).
      return { subtotal: this.redondear(precio), escalonUsado: escalon, tarifaUnitaria: null };
    }

    // volumen_escalonado: el escalón selecciona la tarifa, se multiplica TODO el volumen
    return { subtotal: this.redondear(new Decimal(volumen).mul(precio)), escalonUsado: escalon, tarifaUnitaria: precio };
  }

  /**
   * Franquicia (confirmado por Contabilidad, ver CASOS_BORDE_MODELO_FACTURACION.md
   * sección A1): el mínimo garantizado cubre las primeras `volumenTopeMinimo`
   * unidades por un monto plano; el excedente sobre ese tope se cobra a la
   * tarifa marginal del escalón donde cae el volumen TOTAL del mes.
   *
   * volumen <= tope:  subtotal = minimo
   * volumen >  tope:  subtotal = minimo + (volumen - tope) * tarifa_del_escalon(volumen)
   */
  private calcularMinimoGarantizado(
    volumen: number,
    tarifa: TarifaEntrada,
  ): { subtotal: Decimal; escalonUsado: EscalonTarifa | null; tarifaUnitaria: Decimal | null } {
    if (tarifa.valorMinimo == null) {
      throw new ErrorCalculo('SIN_MINIMO', 'El item es minimo_garantizado pero no tiene valor mínimo para el año.');
    }
    if (tarifa.volumenTopeMinimo == null) {
      throw new ErrorCalculo(
        'SIN_TOPE_MINIMO',
        'El item es minimo_garantizado pero no tiene volumenTopeMinimo (tope de la banda) para el año.',
      );
    }
    const minimo = new Decimal(tarifa.valorMinimo);
    const tope = tarifa.volumenTopeMinimo;

    if (volumen <= tope) {
      return { subtotal: this.redondear(minimo), escalonUsado: null, tarifaUnitaria: null };
    }

    const escalon = this.seleccionarEscalon(volumen, tarifa.escalones);
    if (!escalon) {
      throw new ErrorCalculo(
        'SIN_ESCALON',
        `No hay escalón para el volumen ${volumen} en el año de la tarifa (excedente sobre el mínimo garantizado).`,
      );
    }
    const precio = new Decimal(escalon.precioUnitario);
    const excedente = new Decimal(volumen - tope);
    const subtotal = minimo.add(excedente.mul(precio));
    return { subtotal: this.redondear(subtotal), escalonUsado: escalon, tarifaUnitaria: precio };
  }

  /**
   * Cascada tributaria. Bases por defecto: RteFte y RteICA sobre el subtotal,
   * RteIVA sobre el IVA, autorretención sobre el subtotal (informativa).
   * Las bases son un parámetro para poder ajustarlas por norma/cliente sin tocar el motor.
   */
  calcular(entrada: EntradaCalculo): ResultadoCalculo {
    if (!Number.isFinite(entrada.volumen) || entrada.volumen < 0) {
      throw new ErrorCalculo('VOLUMEN_INVALIDO', `Volumen inválido: ${entrada.volumen}`);
    }
    const { subtotal: subtotalBase, escalonUsado, tarifaUnitaria } = this.calcularSubtotal(
      entrada.modeloCobro,
      entrada.volumen,
      entrada.tarifa,
    );

    // Recargo fijo (B2, ej. MANTENIMIENTO): se suma siempre, sin importar el
    // modelo de cobro ni el volumen.
    const recargoFijo = this.redondear(new Decimal(entrada.tarifa.recargoFijo ?? 0));
    const subtotal = this.redondear(subtotalBase.add(recargoFijo));

    const t = entrada.tasas;

    const iva = this.redondear(subtotal.mul(t.iva));
    const total = this.redondear(subtotal.add(iva));

    const baseRtefte = subtotal;
    const baseRteica = subtotal;
    const rtefte = this.redondear(baseRtefte.mul(t.rtefte));
    const rteica = this.redondear(baseRteica.mul(t.rteica));
    const rteiva = this.redondear(iva.mul(t.rteiva));
    const autorretencion = this.redondear(subtotal.mul(t.autorretencion));

    const valorCartera = this.redondear(total.sub(rtefte).sub(rteica).sub(rteiva));

    // Factura electrónica: subtotal e IVA en pesos enteros; las retenciones de
    // arriba (sobre los valores a 2 decimales) son las que imprime la factura.
    const subtotalFactura = subtotal.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const ivaFactura = iva.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const totalFactura = subtotalFactura.add(ivaFactura);

    return {
      modeloCobro: entrada.modeloCobro,
      volumen: entrada.volumen,
      anioTarifa: entrada.anioTarifa,
      escalonUsado,
      tarifaUnitaria: tarifaUnitaria ? tarifaUnitaria.toNumber() : null,
      recargoFijo: recargoFijo.toNumber(),
      subtotal: subtotal.toNumber(),
      iva: { tasa: t.iva, base: subtotal.toNumber(), valor: iva.toNumber() },
      total: total.toNumber(),
      rtefte: { tasa: t.rtefte, base: baseRtefte.toNumber(), valor: rtefte.toNumber() },
      rteica: { tasa: t.rteica, base: baseRteica.toNumber(), valor: rteica.toNumber() },
      rteiva: { tasa: t.rteiva, base: iva.toNumber(), valor: rteiva.toNumber() },
      autorretencion: { tasa: t.autorretencion, base: subtotal.toNumber(), valor: autorretencion.toNumber() },
      valorCartera: valorCartera.toNumber(),
      factura: {
        subtotal: subtotalFactura.toNumber(),
        iva: ivaFactura.toNumber(),
        total: totalFactura.toNumber(),
        valorCartera: this.redondear(totalFactura.sub(rtefte).sub(rteica).sub(rteiva)).toNumber(),
      },
    };
  }
}
