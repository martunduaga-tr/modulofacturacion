import Decimal from 'decimal.js';
import { MotorCalculoService } from './motor-calculo.service';
import type { ResultadoCalculo, TasasTributarias } from './tipos';

/** Tasas con las que el motor calculó un resultado (el perfil del cliente ya aplicado). */
export function tasasDe(r: ResultadoCalculo): TasasTributarias {
  return { iva: r.iva.tasa, rtefte: r.rtefte.tasa, rteica: r.rteica.tasa, rteiva: r.rteiva.tasa, autorretencion: r.autorretencion.tasa };
}

/**
 * Cobro en USD → pesos con la TRM: el subtotal en dólares × TRM (2 decimales,
 * redondeo comercial) y desde ahí IVA, retenciones y valores de factura en
 * pesos con el mismo motor, como cualquier cobro en COP. Volumen, escalón y
 * tarifa unitaria quedan los de la tarifa en USD (trazabilidad).
 */
export function aPesos(
  usd: ResultadoCalculo,
  trm: number,
  tasas: TasasTributarias = tasasDe(usd),
  motor = new MotorCalculoService(),
): ResultadoCalculo {
  const pesos = (v: number) => new Decimal(v).mul(trm).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  const cop = motor.calcular({
    modeloCobro: 'fijo_mensual',
    volumen: usd.volumen,
    anioTarifa: usd.anioTarifa,
    tarifa: { valorFijo: pesos(usd.subtotal) },
    tasas,
  });
  return {
    ...cop,
    modeloCobro: usd.modeloCobro,
    escalonUsado: usd.escalonUsado,
    tarifaUnitaria: usd.tarifaUnitaria,
    recargoFijo: pesos(usd.recargoFijo),
  };
}
