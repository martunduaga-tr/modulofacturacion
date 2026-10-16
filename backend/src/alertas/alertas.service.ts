import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Like, Repository } from 'typeorm';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { ContratoItem } from '../contratos/entities/contrato-item.entity';
import { Volumen } from '../calculo/entities/volumen.entity';
import { ListAlertasQueryDto } from './dto/list-alertas-query.dto';
import { Alerta, AlertasResultado, ResumenAlertas, SeveridadAlerta, TipoAlerta } from './alertas.types';

const DIAS_POR_VENCER = 7;

/**
 * Genera las alertas en vivo, sobre el estado actual de la base — sin tabla ni
 * estado de "leído/descartado" (decisión tomada: una alerta desaparece SOLO
 * cuando el problema real se corrige). Mismo patrón que
 * ReconciliacionService.sugerencias(): computado en cada consulta.
 */
@Injectable()
export class AlertasService {
  constructor(
    @InjectRepository(Cliente) private readonly clientesRepo: Repository<Cliente>,
    @InjectRepository(Contrato) private readonly contratosRepo: Repository<Contrato>,
    @InjectRepository(ContratoItem) private readonly itemsRepo: Repository<ContratoItem>,
    @InjectRepository(Volumen) private readonly volumenesRepo: Repository<Volumen>,
  ) {}

  async generar(query: ListAlertasQueryDto = {}): Promise<AlertasResultado> {
    const hoy = new Date();
    const anioActual = hoy.getFullYear();
    const mesActual = hoy.getMonth() + 1;

    const alertas: Alerta[] = [
      ...(await this.alertasTarifa(anioActual)),
      ...(await this.alertasNitPendiente()),
      ...(await this.alertasVolumenSinEnlazar(anioActual, mesActual)),
      ...(await this.alertasVigencia(hoy)),
    ];

    const filtradas = alertas.filter(
      (a) => (!query.tipo || a.tipo === query.tipo) && (!query.severidad || a.severidad === query.severidad),
    );

    return { resumen: this.resumir(filtradas), alertas: filtradas };
  }

  async resumen(): Promise<ResumenAlertas> {
    const { resumen } = await this.generar();
    return resumen;
  }

  /** contrato_item activo (de contrato y cliente activos) sin tarifa del año actual, o incompleta. */
  private async alertasTarifa(anioActual: number): Promise<Alerta[]> {
    const items = await this.itemsRepo
      .createQueryBuilder('ci')
      .innerJoinAndSelect('ci.contrato', 'co')
      .innerJoinAndSelect('co.cliente', 'cli')
      .leftJoinAndSelect('ci.escalones', 'esc')
      .leftJoinAndSelect('ci.minimos', 'min')
      .leftJoinAndSelect('ci.tarifasFijas', 'fija')
      .where('ci.estado = :activo', { activo: 'activo' })
      .andWhere('co.estado = :activo', { activo: 'activo' })
      .andWhere('cli.estado = :activo', { activo: 'activo' })
      .getMany();

    const out: Alerta[] = [];
    for (const item of items) {
      const anios = new Set<number>([
        ...item.escalones.map((e) => e.anio),
        ...item.minimos.map((m) => m.anio),
        ...item.tarifasFijas.map((f) => f.anio),
      ]);

      const tieneAnioActual = {
        escalon: item.escalones.some((e) => e.anio === anioActual),
        minimo: item.minimos.some((m) => m.anio === anioActual),
        minimoConTope: item.minimos.some((m) => m.anio === anioActual && m.volumenTope != null),
        fija: item.tarifasFijas.some((f) => f.anio === anioActual),
      };

      const requiereEscalon =
        item.modeloCobro === 'volumen_escalonado' ||
        item.modeloCobro === 'minimo_garantizado' ||
        item.modeloCobro === 'bolsa';
      const requiereMinimo = item.modeloCobro === 'minimo_garantizado';
      const requiereFija = item.modeloCobro === 'fijo_mensual';

      const faltaEscalon = requiereEscalon && !tieneAnioActual.escalon;
      const faltaMinimo = requiereMinimo && !tieneAnioActual.minimo;
      // Mínimo cargado pero sin el tope de la franquicia (ver motor): el cálculo fallaría igual.
      const faltaTopeMinimo = requiereMinimo && tieneAnioActual.minimo && !tieneAnioActual.minimoConTope;
      const faltaFija = requiereFija && !tieneAnioActual.fija;

      if (!faltaEscalon && !faltaMinimo && !faltaTopeMinimo && !faltaFija) continue;

      const sinNadaDelAnio = !anios.has(anioActual);
      const ultimoAnio = anios.size ? Math.max(...anios) : null;

      const base = {
        clienteId: item.contrato.cliente.id,
        clienteNombre: item.contrato.cliente.razonSocial,
        contratoId: item.contrato.id,
        contratoNombre: item.contrato.nombreContrato,
        detalle: { contratoItemId: item.id, modeloCobro: item.modeloCobro, ultimoAnio },
      };

      if (sinNadaDelAnio) {
        out.push({
          ...base,
          tipo: 'desactualizado',
          severidad: 'alta',
          mensaje: ultimoAnio
            ? `Sin tarifa ${anioActual}; la última cargada es de ${ultimoAnio}.`
            : `Sin ninguna tarifa cargada (modelo ${item.modeloCobro}).`,
        });
      } else {
        const faltantes = [
          faltanteLabel('escalones', faltaEscalon),
          faltanteLabel('valor mínimo', faltaMinimo),
          faltanteLabel('tope del mínimo garantizado', faltaTopeMinimo),
          faltanteLabel('valor fijo', faltaFija),
        ]
          .filter(Boolean)
          .join(', ');
        out.push({
          ...base,
          tipo: 'tarifa_incompleta',
          severidad: 'alta',
          mensaje: `Tiene datos de ${anioActual} pero falta ${faltantes} — no se puede liquidar este año.`,
        });
      }
    }
    return out;
  }

  /** Cliente activo con NIT placeholder (migración sin cruce de NIT real). */
  private async alertasNitPendiente(): Promise<Alerta[]> {
    const pendientes = await this.clientesRepo.find({
      where: { estado: 'activo', nit: Like('PEND-%') },
    });
    return pendientes.map((c) => ({
      tipo: 'nit_pendiente' as const,
      severidad: 'media' as const,
      clienteId: c.id,
      clienteNombre: c.razonSocial,
      mensaje: 'NIT pendiente de confirmar — no se puede facturar legalmente con un NIT provisional.',
    }));
  }

  /** Volumen del periodo actual que no quedó enlazado a ningún contrato_item. */
  private async alertasVolumenSinEnlazar(anio: number, mes: number): Promise<Alerta[]> {
    const volumenes = await this.volumenesRepo.find({
      where: { anio, mes, contratoItemId: IsNull() },
      relations: { cliente: true },
    });
    return volumenes.map((v) => ({
      tipo: 'volumen_sin_enlazar' as const,
      severidad: 'alta' as const,
      clienteId: v.clienteId,
      clienteNombre: v.cliente?.razonSocial ?? `cliente #${v.clienteId}`,
      mensaje: `Volumen de ${mes}/${anio} sin contrato enlazado — no se puede liquidar.`,
      detalle: { volumenId: v.id, cantidad: v.cantidad },
    }));
  }

  /** Contrato activo con vigenciaHasta vencida o dentro de los próximos 7 días. */
  private async alertasVigencia(hoy: Date): Promise<Alerta[]> {
    const contratos = await this.contratosRepo.find({
      where: { estado: 'activo' },
      relations: { cliente: true },
    });
    const limite = new Date(hoy);
    limite.setDate(limite.getDate() + DIAS_POR_VENCER);

    const out: Alerta[] = [];
    for (const c of contratos) {
      if (!c.vigenciaHasta) continue;
      const fin = new Date(c.vigenciaHasta);
      if (fin < hoy) {
        out.push({
          tipo: 'vencido',
          severidad: 'critica',
          clienteId: c.cliente.id,
          clienteNombre: c.cliente.razonSocial,
          contratoId: c.id,
          contratoNombre: c.nombreContrato,
          mensaje: `Contrato vencido el ${c.vigenciaHasta}.`,
        });
      } else if (fin <= limite) {
        out.push({
          tipo: 'por_vencer',
          severidad: 'alta',
          clienteId: c.cliente.id,
          clienteNombre: c.cliente.razonSocial,
          contratoId: c.id,
          contratoNombre: c.nombreContrato,
          mensaje: `Contrato vence el ${c.vigenciaHasta} (dentro de ${DIAS_POR_VENCER} días).`,
        });
      }
    }
    return out;
  }

  private resumir(alertas: Alerta[]): ResumenAlertas {
    const porTipo = {} as Record<TipoAlerta, number>;
    const porSeveridad = {} as Record<SeveridadAlerta, number>;
    for (const a of alertas) {
      porTipo[a.tipo] = (porTipo[a.tipo] ?? 0) + 1;
      porSeveridad[a.severidad] = (porSeveridad[a.severidad] ?? 0) + 1;
    }
    return { total: alertas.length, porTipo, porSeveridad };
  }
}

function faltanteLabel(nombre: string, falta: boolean): string | null {
  return falta ? nombre : null;
}
