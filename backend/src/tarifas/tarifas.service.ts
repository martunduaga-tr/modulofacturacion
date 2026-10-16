import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ContratoItem } from '../contratos/entities/contrato-item.entity';
import { TarifaEscalon } from './entities/tarifa-escalon.entity';
import { MinimoGarantizado } from './entities/minimo-garantizado.entity';
import { TarifaFija } from './entities/tarifa-fija.entity';
import { RecargoFijo } from './entities/recargo-fijo.entity';
import { AuditoriaCambio } from '../auditoria/entities/auditoria-cambio.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TarifasValidationService } from './tarifas-validation.service';
import { TarifaAnioDto } from './dto/tarifa-anio.dto';
import { SetEscalonesDto } from './dto/set-escalones.dto';
import { SetRecargosDto } from './dto/set-recargos.dto';
import { UpdateEscalonDto } from './dto/update-escalon.dto';
import { UpdateMinimoDto } from './dto/update-minimo.dto';
import { UpdateFijaDto } from './dto/update-fija.dto';

export interface TarifasDeItem {
  escalones: TarifaEscalon[];
  minimos: MinimoGarantizado[];
  tarifasFijas: TarifaFija[];
  recargos: RecargoFijo[];
}

@Injectable()
export class TarifasService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ContratoItem)
    private readonly itemsRepo: Repository<ContratoItem>,
    @InjectRepository(TarifaEscalon)
    private readonly escalonesRepo: Repository<TarifaEscalon>,
    @InjectRepository(MinimoGarantizado)
    private readonly minimosRepo: Repository<MinimoGarantizado>,
    @InjectRepository(TarifaFija)
    private readonly fijasRepo: Repository<TarifaFija>,
    @InjectRepository(RecargoFijo)
    private readonly recargosRepo: Repository<RecargoFijo>,
    private readonly validacion: TarifasValidationService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private async getItemOrFail(itemId: number): Promise<ContratoItem> {
    const item = await this.itemsRepo.findOne({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException(`No existe el contrato_item con id ${itemId}`);
    }
    return item;
  }

  /** Tarifas de un item, opcionalmente filtradas por año. */
  async getByItem(itemId: number, anio?: number): Promise<TarifasDeItem> {
    await this.getItemOrFail(itemId);
    const where = anio ? { contratoItemId: itemId, anio } : { contratoItemId: itemId };
    const [escalones, minimos, tarifasFijas, recargos] = await Promise.all([
      this.escalonesRepo.find({ where, order: { anio: 'ASC', volumenDesde: 'ASC' } }),
      this.minimosRepo.find({ where, order: { anio: 'ASC' } }),
      this.fijasRepo.find({ where, order: { anio: 'ASC' } }),
      this.recargosRepo.find({ where, order: { anio: 'ASC', concepto: 'ASC' } }),
    ]);
    return { escalones, minimos, tarifasFijas, recargos };
  }

  /** RF-5: agrega la tarifa de un nuevo año a un item existente. */
  async agregarAnio(itemId: number, dto: TarifaAnioDto, usuario: string): Promise<TarifasDeItem> {
    const item = await this.getItemOrFail(itemId);
    this.validacion.validarTarifaAnio(item.modeloCobro, dto);

    const yaExiste = await this.anioTieneTarifa(itemId, dto.anio);
    if (yaExiste) {
      throw new ConflictException(
        `El item ya tiene tarifa para el año ${dto.anio}; use los endpoints de edición.`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await this.persistirTarifaAnio(manager, itemId, dto);
      await this.auditoria.registrar(
        {
          tabla: 'contrato_items',
          registroId: itemId,
          usuario,
          accion: 'INSERT',
          valorNuevo: { agregarAnio: dto },
        },
        manager.getRepository(AuditoriaCambio),
      );
    });

    return this.getByItem(itemId, dto.anio);
  }

  /** Define o reemplaza los escalones de un item para un año (modelos escalonado/mínimo/bolsa). */
  async setEscalones(itemId: number, dto: SetEscalonesDto, usuario: string): Promise<TarifaEscalon[]> {
    const item = await this.getItemOrFail(itemId);
    if (item.modeloCobro === 'fijo_mensual') {
      throw new BadRequestException("El modelo 'fijo_mensual' no maneja escalones.");
    }
    this.validacion.validarGrupoEscalones(dto.anio, dto.escalones);
    if (item.modeloCobro === 'minimo_garantizado') {
      const minimo = await this.minimosRepo.findOne({ where: { contratoItemId: itemId, anio: dto.anio } });
      if (minimo?.volumenTope != null) {
        this.validacion.validarContiguidadConTope(dto.anio, minimo.volumenTope, dto.escalones);
      }
    }

    const anteriores = await this.escalonesRepo.find({
      where: { contratoItemId: itemId, anio: dto.anio },
    });

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TarifaEscalon);
      if (anteriores.length > 0) {
        await repo.remove(anteriores);
      }
      const nuevos = dto.escalones.map((e) =>
        repo.create({
          contratoItemId: itemId,
          anio: dto.anio,
          volumenDesde: e.volumenDesde,
          volumenHasta: e.volumenHasta,
          precioUnitario: e.precioUnitario,
          ipcAplicado: e.ipcAplicado ?? null,
        }),
      );
      await repo.save(nuevos);
      await this.auditoria.registrar(
        {
          tabla: 'tarifa_escalones',
          registroId: itemId,
          usuario,
          accion: anteriores.length > 0 ? 'UPDATE' : 'INSERT',
          valorAnterior: anteriores.length > 0 ? anteriores : undefined,
          valorNuevo: { anio: dto.anio, escalones: dto.escalones },
        },
        manager.getRepository(AuditoriaCambio),
      );
    });

    return this.escalonesRepo.find({
      where: { contratoItemId: itemId, anio: dto.anio },
      order: { volumenDesde: 'ASC' },
    });
  }

  /** Define o reemplaza los recargos fijos de un item para un año (cualquier modelo; puede quedar vacío). */
  async setRecargos(itemId: number, dto: SetRecargosDto, usuario: string): Promise<RecargoFijo[]> {
    await this.getItemOrFail(itemId);
    this.validacion.validarRecargosFijos(dto.anio, dto.recargos);

    const anteriores = await this.recargosRepo.find({ where: { contratoItemId: itemId, anio: dto.anio } });

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RecargoFijo);
      if (anteriores.length > 0) {
        await repo.remove(anteriores);
      }
      if (dto.recargos.length > 0) {
        const nuevos = dto.recargos.map((r) =>
          repo.create({ contratoItemId: itemId, anio: dto.anio, concepto: r.concepto, valor: r.valor }),
        );
        await repo.save(nuevos);
      }
      await this.auditoria.registrar(
        {
          tabla: 'recargo_fijo',
          registroId: itemId,
          usuario,
          accion: anteriores.length > 0 ? 'UPDATE' : 'INSERT',
          valorAnterior: anteriores.length > 0 ? anteriores : undefined,
          valorNuevo: { anio: dto.anio, recargos: dto.recargos },
        },
        manager.getRepository(AuditoriaCambio),
      );
    });

    return this.recargosRepo.find({ where: { contratoItemId: itemId, anio: dto.anio }, order: { concepto: 'ASC' } });
  }

  /** RF-4: edita un escalón; revalida la cobertura del año tras el cambio. */
  async updateEscalon(escalonId: number, dto: UpdateEscalonDto, usuario: string): Promise<TarifaEscalon> {
    const escalon = await this.escalonesRepo.findOne({ where: { id: escalonId } });
    if (!escalon) {
      throw new NotFoundException(`No existe el escalón con id ${escalonId}`);
    }
    const anterior = { ...escalon };

    const actualizado: TarifaEscalon = { ...escalon, ...this.limpiarUndefined(dto) };

    // Revalida el grupo del año con el cambio aplicado
    const grupo = await this.escalonesRepo.find({
      where: { contratoItemId: escalon.contratoItemId, anio: escalon.anio },
    });
    const grupoSimulado = grupo.map((e) => (e.id === escalonId ? actualizado : e));
    this.validacion.validarGrupoEscalones(escalon.anio, grupoSimulado);

    Object.assign(escalon, this.limpiarUndefined(dto));
    const guardado = await this.escalonesRepo.save(escalon);

    await this.auditoria.registrar({
      tabla: 'tarifa_escalones',
      registroId: escalonId,
      usuario,
      accion: 'UPDATE',
      valorAnterior: anterior,
      valorNuevo: guardado,
    });
    return guardado;
  }

  async updateMinimo(id: number, dto: UpdateMinimoDto, usuario: string): Promise<MinimoGarantizado> {
    const minimo = await this.minimosRepo.findOne({ where: { id } });
    if (!minimo) {
      throw new NotFoundException(`No existe el mínimo garantizado con id ${id}`);
    }
    const anterior = { valorMinimo: minimo.valorMinimo, volumenTope: minimo.volumenTope };
    minimo.valorMinimo = dto.valorMinimo;
    if (dto.volumenTope !== undefined) {
      minimo.volumenTope = dto.volumenTope;
    }
    const guardado = await this.minimosRepo.save(minimo);
    await this.auditoria.registrar({
      tabla: 'minimo_garantizado',
      registroId: id,
      usuario,
      accion: 'UPDATE',
      valorAnterior: anterior,
      valorNuevo: { valorMinimo: guardado.valorMinimo, volumenTope: guardado.volumenTope },
    });
    return guardado;
  }

  async updateFija(id: number, dto: UpdateFijaDto, usuario: string): Promise<TarifaFija> {
    const fija = await this.fijasRepo.findOne({ where: { id } });
    if (!fija) {
      throw new NotFoundException(`No existe la tarifa fija con id ${id}`);
    }
    const anterior = { valorFijo: fija.valorFijo };
    fija.valorFijo = dto.valorFijo;
    const guardado = await this.fijasRepo.save(fija);
    await this.auditoria.registrar({
      tabla: 'tarifa_fija',
      registroId: id,
      usuario,
      accion: 'UPDATE',
      valorAnterior: anterior,
      valorNuevo: { valorFijo: guardado.valorFijo },
    });
    return guardado;
  }

  // ----- Helpers usados también por contratos (creación nested) -----------

  /** ¿El item ya tiene alguna tarifa registrada para ese año? */
  async anioTieneTarifa(itemId: number, anio: number): Promise<boolean> {
    const [e, m, f, r] = await Promise.all([
      this.escalonesRepo.count({ where: { contratoItemId: itemId, anio } }),
      this.minimosRepo.count({ where: { contratoItemId: itemId, anio } }),
      this.fijasRepo.count({ where: { contratoItemId: itemId, anio } }),
      this.recargosRepo.count({ where: { contratoItemId: itemId, anio } }),
    ]);
    return e + m + f + r > 0;
  }

  /** Persiste la tarifa de un año (escalones / mínimo / fija / recargos) usando el manager dado. */
  async persistirTarifaAnio(manager: EntityManager, itemId: number, dto: TarifaAnioDto): Promise<void> {
    if (dto.escalones && dto.escalones.length > 0) {
      const repo = manager.getRepository(TarifaEscalon);
      const filas = dto.escalones.map((e) =>
        repo.create({
          contratoItemId: itemId,
          anio: dto.anio,
          volumenDesde: e.volumenDesde,
          volumenHasta: e.volumenHasta,
          precioUnitario: e.precioUnitario,
          ipcAplicado: e.ipcAplicado ?? null,
        }),
      );
      await repo.save(filas);
    }
    if (dto.valorMinimo != null) {
      const repo = manager.getRepository(MinimoGarantizado);
      await repo.save(
        repo.create({
          contratoItemId: itemId,
          anio: dto.anio,
          valorMinimo: dto.valorMinimo,
          volumenTope: dto.volumenTopeMinimo ?? null,
        }),
      );
    }
    if (dto.valorFijo != null) {
      const repo = manager.getRepository(TarifaFija);
      await repo.save(repo.create({ contratoItemId: itemId, anio: dto.anio, valorFijo: dto.valorFijo }));
    }
    if (dto.recargosFijos && dto.recargosFijos.length > 0) {
      const repo = manager.getRepository(RecargoFijo);
      const filas = dto.recargosFijos.map((r) =>
        repo.create({ contratoItemId: itemId, anio: dto.anio, concepto: r.concepto, valor: r.valor }),
      );
      await repo.save(filas);
    }
  }

  private limpiarUndefined<T extends object>(obj: T): Partial<T> {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined),
    ) as Partial<T>;
  }
}
