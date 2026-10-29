import { BadRequestException, Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { TrmDiaria } from './entities/trm-diaria.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';

/**
 * TRM por fecha. Fuente oficial: Superfinanciera, publicada en datos.gov.co
 * (dataset 32sa-8pi3: valor, vigenciadesde, vigenciahasta; el fin de semana
 * rige la del viernes). Lo consultado se guarda en coe.trm_diaria; si
 * Contabilidad digita una TRM para una fecha, esa manda (fuente 'manual').
 */
export const TRM_URL = 'https://www.datos.gov.co/resource/32sa-8pi3.json';
export const CONSULTA_TRM = 'CONSULTA_TRM';

/** Devuelve la TRM vigente en la fecha (AAAA-MM-DD) según la fuente oficial, o null si no está publicada. */
export type ConsultaTrm = (fecha: string) => Promise<number | null>;

export const consultarDatosGovCo: ConsultaTrm = async (fecha) => {
  const t = `${fecha}T00:00:00.000`;
  const url = `${process.env.TRM_URL || TRM_URL}?$where=${encodeURIComponent(`vigenciadesde<='${t}' AND vigenciahasta>='${t}'`)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`datos.gov.co respondió ${r.status}`);
  const filas = (await r.json()) as { valor: string }[];
  const valor = Number(filas[0]?.valor);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class TrmService {
  constructor(
    @InjectRepository(TrmDiaria) private readonly repo: Repository<TrmDiaria>,
    private readonly auditoria: AuditoriaService,
    @Optional() @Inject(CONSULTA_TRM) private readonly consultar: ConsultaTrm = consultarDatosGovCo,
  ) {}

  /**
   * TRM de una fecha exacta: la guardada (manual o ya consultada) o la de datos.gov.co.
   * Si no se puede obtener, error claro para que Contabilidad la digite.
   */
  async deFecha(fecha: string): Promise<TrmDiaria> {
    if (!FECHA.test(fecha)) throw new BadRequestException(`fecha debe ser AAAA-MM-DD, no "${fecha}"`);
    const guardada = await this.repo.findOne({ where: { fecha } });
    if (guardada) return guardada;
    let valor: number | null = null;
    try {
      valor = await this.consultar(fecha);
    } catch (e) {
      throw new ServiceUnavailableException(
        `No se pudo consultar la TRM del ${fecha} en datos.gov.co (${(e as Error).message}). Digítela a mano.`,
      );
    }
    if (valor == null) throw new BadRequestException(`La Superfinanciera aún no publica la TRM del ${fecha}. Digítela a mano.`);
    return this.repo.save(this.repo.create({ fecha, valor, fuente: 'datos.gov.co', usuario: null }));
  }

  /** Para estimar al liquidar: la de hoy o, si no se puede, la última guardada. */
  async estimada(hoy: string): Promise<TrmDiaria | null> {
    try {
      return await this.deFecha(hoy);
    } catch {
      return this.repo.findOne({ where: { fecha: LessThanOrEqual(hoy) }, order: { fecha: 'DESC' } });
    }
  }

  /** TRM digitada por Contabilidad para una fecha (reemplaza la consultada). Queda en auditoría. */
  async registrarManual(fecha: string, valor: number, usuario: string): Promise<TrmDiaria> {
    if (!FECHA.test(fecha)) throw new BadRequestException(`fecha debe ser AAAA-MM-DD, no "${fecha}"`);
    if (!(valor > 0)) throw new BadRequestException('La TRM debe ser mayor que 0');
    const anterior = await this.repo.findOne({ where: { fecha } });
    const valorAnterior = anterior ? { valor: anterior.valor, fuente: anterior.fuente } : undefined; // antes de merge
    const guardada = await this.repo.save(
      this.repo.merge(anterior ?? this.repo.create({ fecha }), { valor, fuente: 'manual', usuario }),
    );
    await this.auditoria.registrar({
      tabla: 'trm_diaria',
      registroId: Number(fecha.replace(/-/g, '')),
      usuario,
      accion: anterior ? 'UPDATE' : 'INSERT',
      valorAnterior,
      valorNuevo: { fecha, valor, fuente: 'manual' },
    });
    return guardada;
  }
}
