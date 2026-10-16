import { BadRequestException, Injectable } from '@nestjs/common';
import { ModeloCobro } from '../contratos/entities/contrato-item.entity';
import { TarifaAnioDto } from './dto/tarifa-anio.dto';

/** Rango mínimo para validar cobertura; lo satisfacen EscalonValorDto y TarifaEscalon. */
interface EscalonRango {
  volumenDesde: number;
  volumenHasta: number;
}

/**
 * Validación de tarifas (sin acceso a BD). Centraliza las reglas del dominio
 * para que contratos (creación nested) y tarifas (edición) las apliquen igual.
 */
@Injectable()
export class TarifasValidationService {
  /** Valida una lista de tarifas-por-año contra el modelo de cobro del item. */
  validarTarifas(modeloCobro: ModeloCobro, tarifas: TarifaAnioDto[]): void {
    if (!tarifas || tarifas.length === 0) {
      throw new BadRequestException('El item debe tener al menos una tarifa (un año).');
    }
    const anios = tarifas.map((t) => t.anio);
    const repetido = anios.find((a, i) => anios.indexOf(a) !== i);
    if (repetido !== undefined) {
      throw new BadRequestException(`El año ${repetido} está repetido en el item.`);
    }
    for (const tarifa of tarifas) {
      this.validarTarifaAnio(modeloCobro, tarifa);
    }
  }

  /** Valida la tarifa de un solo año contra el modelo de cobro. */
  validarTarifaAnio(modeloCobro: ModeloCobro, tarifa: TarifaAnioDto): void {
    switch (modeloCobro) {
      case 'volumen_escalonado':
        if (tarifa.valorFijo != null || tarifa.valorMinimo != null) {
          throw new BadRequestException(
            `Año ${tarifa.anio}: el modelo 'volumen_escalonado' no admite valorFijo ni valorMinimo.`,
          );
        }
        this.validarGrupoEscalones(tarifa.anio, tarifa.escalones);
        break;

      case 'minimo_garantizado':
        if (tarifa.valorFijo != null) {
          throw new BadRequestException(
            `Año ${tarifa.anio}: el modelo 'minimo_garantizado' no admite valorFijo.`,
          );
        }
        if (tarifa.valorMinimo == null) {
          throw new BadRequestException(
            `Año ${tarifa.anio}: el modelo 'minimo_garantizado' requiere valorMinimo.`,
          );
        }
        if (tarifa.volumenTopeMinimo == null) {
          throw new BadRequestException(
            `Año ${tarifa.anio}: el modelo 'minimo_garantizado' requiere volumenTopeMinimo (tope de la banda que cubre el mínimo).`,
          );
        }
        // Necesita la tarifa por volumen para el excedente sobre el tope (franquicia)
        this.validarGrupoEscalones(tarifa.anio, tarifa.escalones);
        this.validarContiguidadConTope(tarifa.anio, tarifa.volumenTopeMinimo, tarifa.escalones!);
        break;

      case 'fijo_mensual':
        if ((tarifa.escalones && tarifa.escalones.length > 0) || tarifa.valorMinimo != null) {
          throw new BadRequestException(
            `Año ${tarifa.anio}: el modelo 'fijo_mensual' no admite escalones ni valorMinimo.`,
          );
        }
        if (tarifa.valorFijo == null) {
          throw new BadRequestException(
            `Año ${tarifa.anio}: el modelo 'fijo_mensual' requiere valorFijo.`,
          );
        }
        break;

      case 'bolsa':
        if (tarifa.valorFijo != null || tarifa.valorMinimo != null) {
          throw new BadRequestException(
            `Año ${tarifa.anio}: el modelo 'bolsa' no admite valorFijo ni valorMinimo.`,
          );
        }
        // Mismo shape que volumen_escalonado; el motor interpreta precioUnitario
        // como monto plano de la banda, no como precio por unidad.
        this.validarGrupoEscalones(tarifa.anio, tarifa.escalones);
        break;

      default:
        throw new BadRequestException(`Modelo de cobro desconocido: '${modeloCobro}'.`);
    }

    this.validarRecargosFijos(tarifa.anio, tarifa.recargosFijos);
  }

  /**
   * El primer escalón debe arrancar justo donde termina la banda del mínimo
   * (ej. ALKA MOTOR: tope=1.000, primer escalón 1.001-2.500) — si no, hay un
   * hueco o solapamiento entre la franquicia y el cobro por excedente.
   */
  validarContiguidadConTope(anio: number, tope: number, escalones: EscalonRango[]): void {
    const minDesde = Math.min(...escalones.map((e) => e.volumenDesde));
    if (minDesde !== tope + 1) {
      throw new BadRequestException(
        `Año ${anio}: el primer escalón debe empezar en volumenTopeMinimo + 1 (${tope + 1}), pero empieza en ${minDesde}.`,
      );
    }
  }

  /** Recargos fijos: permitidos con cualquier modelo; sin conceptos repetidos en el año. */
  validarRecargosFijos(anio: number, recargos?: { concepto: string }[]): void {
    if (!recargos || recargos.length === 0) return;
    const conceptos = recargos.map((r) => r.concepto.trim().toUpperCase());
    const repetido = conceptos.find((c, i) => conceptos.indexOf(c) !== i);
    if (repetido !== undefined) {
      throw new BadRequestException(`Año ${anio}: el recargo '${repetido}' está repetido.`);
    }
  }

  /**
   * Escalones de un mismo año: precio > 0 (ya validado en el DTO), desde <= hasta,
   * y cobertura contigua sin solapamientos ni huecos (RF-3).
   */
  validarGrupoEscalones(anio: number, escalones?: EscalonRango[]): void {
    if (!escalones || escalones.length === 0) {
      throw new BadRequestException(`Año ${anio}: se requiere al menos un escalón.`);
    }
    for (const e of escalones) {
      if (e.volumenDesde > e.volumenHasta) {
        throw new BadRequestException(
          `Año ${anio}: un escalón tiene volumenDesde (${e.volumenDesde}) mayor que volumenHasta (${e.volumenHasta}).`,
        );
      }
    }
    const ordenados = [...escalones].sort((a, b) => a.volumenDesde - b.volumenDesde);
    for (let i = 1; i < ordenados.length; i++) {
      const prev = ordenados[i - 1];
      const cur = ordenados[i];
      if (cur.volumenDesde <= prev.volumenHasta) {
        throw new BadRequestException(
          `Año ${anio}: los escalones se solapan (uno termina en ${prev.volumenHasta} y el siguiente empieza en ${cur.volumenDesde}).`,
        );
      }
      if (cur.volumenDesde !== prev.volumenHasta + 1) {
        throw new BadRequestException(
          `Año ${anio}: hay un hueco entre ${prev.volumenHasta} y ${cur.volumenDesde}; los escalones deben ser contiguos.`,
        );
      }
    }
  }
}
