import { MotorCalculoService } from './motor-calculo.service';
import { ErrorCalculo, TasasTributarias } from './tipos';

const TASAS: TasasTributarias = {
  iva: 0.19,
  rtefte: 0.035,
  rteica: 0.00966,
  rteiva: 0.15,
  autorretencion: 0.008,
};

describe('MotorCalculoService', () => {
  const motor = new MotorCalculoService();

  describe('volumen_escalonado', () => {
    it('caso real AXA: 243.936 × 50,904 = 12.417.318 (el escalón selecciona la tarifa, se multiplica todo el volumen)', () => {
      const r = motor.calcular({
        modeloCobro: 'volumen_escalonado',
        volumen: 243936,
        anioTarifa: 2026,
        tarifa: {
          escalones: [
            { volumenDesde: 0, volumenHasta: 100000, precioUnitario: 55 },
            { volumenDesde: 100001, volumenHasta: 999999999, precioUnitario: 50.904 },
          ],
        },
        tasas: TASAS,
      });
      expect(r.tarifaUnitaria).toBe(50.904); // cae en el segundo escalón
      expect(r.subtotal).toBe(12417318.14);
      expect(r.iva.valor).toBe(2359290.45);
      expect(r.total).toBe(14776608.59);
    });
  });

  describe('minimo_garantizado (franquicia, confirmado por Contabilidad — ver CASOS_BORDE_MODELO_FACTURACION.md A1)', () => {
    const ESCALONES_ALKA_MOTOR = [
      { volumenDesde: 1001, volumenHasta: 2500, precioUnitario: 236.45 },
      { volumenDesde: 2501, volumenHasta: 3000, precioUnitario: 217.32 },
      { volumenDesde: 3001, volumenHasta: 5000, precioUnitario: 203.65 },
    ];

    it('caso real ALKA MOTOR: volumen 3.500 > tope 1.000 → 251.359 + 2.500×203,65 = 760.484 (excedente a la tarifa del volumen total)', () => {
      const r = motor.calcular({
        modeloCobro: 'minimo_garantizado',
        volumen: 3500,
        anioTarifa: 2026,
        tarifa: {
          escalones: ESCALONES_ALKA_MOTOR,
          valorMinimo: 251359,
          volumenTopeMinimo: 1000,
        },
        tasas: TASAS,
      });
      expect(r.tarifaUnitaria).toBe(203.65); // escalón donde cae el volumen TOTAL (3.500), no el del excedente
      expect(r.subtotal).toBe(760484); // 251.359 + (3.500-1.000)×203,65
    });

    it('volumen dentro de la banda del mínimo (≤ tope): se cobra solo el monto plano, sin importar cuánto falte para el tope', () => {
      const r = motor.calcular({
        modeloCobro: 'minimo_garantizado',
        volumen: 500,
        anioTarifa: 2026,
        tarifa: {
          escalones: ESCALONES_ALKA_MOTOR,
          valorMinimo: 251359,
          volumenTopeMinimo: 1000,
        },
        tasas: TASAS,
      });
      expect(r.subtotal).toBe(251359);
      expect(r.tarifaUnitaria).toBeNull();
      expect(r.escalonUsado).toBeNull();
    });

    it('volumen == tope: todavía cubierto por el monto plano (inclusive)', () => {
      const r = motor.calcular({
        modeloCobro: 'minimo_garantizado',
        volumen: 1000,
        anioTarifa: 2026,
        tarifa: { escalones: ESCALONES_ALKA_MOTOR, valorMinimo: 251359, volumenTopeMinimo: 1000 },
        tasas: TASAS,
      });
      expect(r.subtotal).toBe(251359);
    });

    it('cascada tributaria completa sobre el subtotal de la franquicia', () => {
      const r = motor.calcular({
        modeloCobro: 'minimo_garantizado',
        volumen: 100, // dentro de la banda del mínimo
        anioTarifa: 2026,
        tarifa: {
          escalones: [{ volumenDesde: 1001, volumenHasta: 999999999, precioUnitario: 200 }],
          valorMinimo: 183906,
          volumenTopeMinimo: 1000,
        },
        tasas: TASAS,
      });
      expect(r.subtotal).toBe(183906);
      expect(r.iva.valor).toBe(34942.14);
      expect(r.total).toBe(218848.14);
      expect(r.rtefte.valor).toBe(6436.71); // 183906 × 3,5%
      expect(r.rteica.valor).toBe(1776.53); // 183906 × 0,966%
      expect(r.rteiva.valor).toBe(5241.32); // 34942.14 × 15%
      expect(r.autorretencion.valor).toBe(1471.25); // informativa
      expect(r.valorCartera).toBe(205393.58); // total − rtefte − rteica − rteiva
    });

    it('sin volumenTopeMinimo → ErrorCalculo SIN_TOPE_MINIMO (no calcula silenciosamente con la fórmula vieja)', () => {
      expect.assertions(2);
      try {
        motor.calcular({
          modeloCobro: 'minimo_garantizado',
          volumen: 3500,
          anioTarifa: 2026,
          tarifa: { escalones: ESCALONES_ALKA_MOTOR, valorMinimo: 251359 },
          tasas: TASAS,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(ErrorCalculo);
        expect((e as ErrorCalculo).codigo).toBe('SIN_TOPE_MINIMO');
      }
    });

    it('excedente sin escalón que cubra el volumen total → ErrorCalculo SIN_ESCALON', () => {
      expect.assertions(2);
      try {
        motor.calcular({
          modeloCobro: 'minimo_garantizado',
          volumen: 9000, // fuera de ESCALONES_ALKA_MOTOR (llega hasta 5.000)
          anioTarifa: 2026,
          tarifa: { escalones: ESCALONES_ALKA_MOTOR, valorMinimo: 251359, volumenTopeMinimo: 1000 },
          tasas: TASAS,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(ErrorCalculo);
        expect((e as ErrorCalculo).codigo).toBe('SIN_ESCALON');
      }
    });
  });

  describe('bolsa (4° modelo, confirmado por Contabilidad — ver CASOS_BORDE_MODELO_FACTURACION.md B1)', () => {
    const ESCALONES_SALUD_MIA = [
      { volumenDesde: 7501, volumenHasta: 8000, precioUnitario: 1312108.57 },
      { volumenDesde: 8001, volumenHasta: 8500, precioUnitario: 1336027.21 },
    ];

    it('caso real FUNDACION SALUD MIA EPS: 7.800 transacciones → monto plano de la banda, sin multiplicar por volumen', () => {
      const r = motor.calcular({
        modeloCobro: 'bolsa',
        volumen: 7800,
        anioTarifa: 2026,
        tarifa: { escalones: ESCALONES_SALUD_MIA },
        tasas: TASAS,
      });
      expect(r.subtotal).toBe(1312108.57);
      expect(r.tarifaUnitaria).toBeNull(); // no es un precio "por unidad"
    });

    it('7.900 transacciones (misma banda) → cobro idéntico a 7.800', () => {
      const r = motor.calcular({
        modeloCobro: 'bolsa',
        volumen: 7900,
        anioTarifa: 2026,
        tarifa: { escalones: ESCALONES_SALUD_MIA },
        tasas: TASAS,
      });
      expect(r.subtotal).toBe(1312108.57);
    });

    it('8.200 transacciones (banda siguiente) → cambia el monto', () => {
      const r = motor.calcular({
        modeloCobro: 'bolsa',
        volumen: 8200,
        anioTarifa: 2026,
        tarifa: { escalones: ESCALONES_SALUD_MIA },
        tasas: TASAS,
      });
      expect(r.subtotal).toBe(1336027.21);
    });

    it('sin banda que cubra el volumen → ErrorCalculo SIN_ESCALON', () => {
      expect.assertions(2);
      try {
        motor.calcular({
          modeloCobro: 'bolsa',
          volumen: 100,
          anioTarifa: 2026,
          tarifa: { escalones: ESCALONES_SALUD_MIA },
          tasas: TASAS,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(ErrorCalculo);
        expect((e as ErrorCalculo).codigo).toBe('SIN_ESCALON');
      }
    });
  });

  describe('recargoFijo (aditivo sobre cualquier modelo, confirmado por Contabilidad — ver CASOS_BORDE_MODELO_FACTURACION.md B2)', () => {
    it('caso real SAN CARLOS: escala normal + $1.839.270 de mantenimiento, todos los meses', () => {
      const r = motor.calcular({
        modeloCobro: 'volumen_escalonado',
        volumen: 1500,
        anioTarifa: 2026,
        tarifa: {
          escalones: [{ volumenDesde: 1, volumenHasta: 2000, precioUnitario: 920 }],
          recargoFijo: 1839270,
        },
        tasas: TASAS,
      });
      expect(r.subtotal).toBe(3219270); // 1.500×920 + 1.839.270
      expect(r.recargoFijo).toBe(1839270);
    });

    it('sin recargoFijo, el resultado no cambia (recargoFijo = 0)', () => {
      const r = motor.calcular({
        modeloCobro: 'volumen_escalonado',
        volumen: 1500,
        anioTarifa: 2026,
        tarifa: { escalones: [{ volumenDesde: 1, volumenHasta: 2000, precioUnitario: 920 }] },
        tasas: TASAS,
      });
      expect(r.subtotal).toBe(1380000);
      expect(r.recargoFijo).toBe(0);
    });
  });

  describe('fijo_mensual', () => {
    it('subtotal = valor fijo, independiente del volumen', () => {
      const r = motor.calcular({
        modeloCobro: 'fijo_mensual',
        volumen: 0,
        anioTarifa: 2026,
        tarifa: { valorFijo: 250000 },
        tasas: TASAS,
      });
      expect(r.subtotal).toBe(250000);
      expect(r.iva.valor).toBe(47500);
      expect(r.total).toBe(297500);
    });
  });

  describe('casos borde (marca clara, nunca cálculo silencioso)', () => {
    it('sin escalón para el volumen → ErrorCalculo SIN_ESCALON', () => {
      expect(() =>
        motor.calcular({
          modeloCobro: 'volumen_escalonado',
          volumen: 500,
          anioTarifa: 2026,
          tarifa: { escalones: [{ volumenDesde: 1000, volumenHasta: 5000, precioUnitario: 10 }] },
          tasas: TASAS,
        }),
      ).toThrow(ErrorCalculo);
    });

    it('mínimo sin valor mínimo → ErrorCalculo SIN_MINIMO', () => {
      expect(() =>
        motor.calcular({
          modeloCobro: 'minimo_garantizado',
          volumen: 100,
          anioTarifa: 2026,
          tarifa: { escalones: [{ volumenDesde: 0, volumenHasta: 999, precioUnitario: 10 }] },
          tasas: TASAS,
        }),
      ).toThrow(/SIN_MINIMO|mínimo/);
    });
  });

  describe('determinismo', () => {
    it('misma entrada → mismo resultado, siempre', () => {
      const entrada = {
        modeloCobro: 'volumen_escalonado' as const,
        volumen: 243936,
        anioTarifa: 2026,
        tarifa: { escalones: [{ volumenDesde: 0, volumenHasta: 999999999, precioUnitario: 50.904 }] },
        tasas: TASAS,
      };
      expect(motor.calcular(entrada)).toEqual(motor.calcular(entrada));
    });
  });
});
