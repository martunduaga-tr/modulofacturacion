import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ParametroGlobal } from './entities/parametro-global.entity';
import { UpdateParametroDto } from './dto/update-parametro.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class ParametrosService {
  constructor(
    @InjectRepository(ParametroGlobal)
    private readonly parametrosRepo: Repository<ParametroGlobal>,
    private readonly auditoria: AuditoriaService,
  ) {}

  private hoy(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Valores vigentes hoy: por cada clave, la fila con la mayor vigencia_desde
   * que ya entró en vigor. La tabla es pequeña, se resuelve en memoria.
   */
  async findVigentes(): Promise<ParametroGlobal[]> {
    const hoy = this.hoy();
    const filas = await this.parametrosRepo.find({
      where: { vigenciaDesde: LessThanOrEqual(hoy) },
      order: { clave: 'ASC', vigenciaDesde: 'DESC' },
    });
    const vigentePorClave = new Map<string, ParametroGlobal>();
    for (const fila of filas) {
      if (!vigentePorClave.has(fila.clave)) {
        vigentePorClave.set(fila.clave, fila);
      }
    }
    return Array.from(vigentePorClave.values());
  }

  /** Historial completo de una clave (todas sus vigencias). */
  async findHistorial(clave: string): Promise<ParametroGlobal[]> {
    return this.parametrosRepo.find({
      where: { clave: clave.trim().toUpperCase() },
      order: { vigenciaDesde: 'DESC' },
    });
  }

  /**
   * Fija el valor de un parámetro para una vigencia. Si ya existe una fila para
   * esa (clave, vigencia) la actualiza; si no, crea una nueva versión.
   */
  async upsert(claveParam: string, dto: UpdateParametroDto, usuario: string): Promise<ParametroGlobal> {
    const clave = claveParam.trim().toUpperCase();
    const vigenciaDesde = dto.vigenciaDesde ?? this.hoy();

    let parametro = await this.parametrosRepo.findOne({ where: { clave, vigenciaDesde } });
    const valorAnterior = parametro ? { valor: parametro.valor } : undefined;
    const accion = parametro ? 'UPDATE' : 'INSERT';

    if (parametro) {
      parametro.valor = dto.valor;
    } else {
      parametro = this.parametrosRepo.create({ clave, valor: dto.valor, vigenciaDesde });
    }
    const guardado = await this.parametrosRepo.save(parametro);

    await this.auditoria.registrar({
      tabla: 'parametros_globales',
      registroId: guardado.id,
      usuario,
      accion,
      valorAnterior,
      valorNuevo: { clave, valor: guardado.valor, vigenciaDesde },
    });

    return guardado;
  }

  async getVigente(claveParam: string): Promise<ParametroGlobal> {
    const clave = claveParam.trim().toUpperCase();
    const fila = await this.parametrosRepo.findOne({
      where: { clave, vigenciaDesde: LessThanOrEqual(this.hoy()) },
      order: { vigenciaDesde: 'DESC' },
    });
    if (!fila) {
      throw new NotFoundException(`No hay un valor vigente para el parámetro '${clave}'`);
    }
    return fila;
  }
}
