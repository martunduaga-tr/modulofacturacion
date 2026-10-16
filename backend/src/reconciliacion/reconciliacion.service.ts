import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Like, Not, Repository } from 'typeorm';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { ContratoItem } from '../contratos/entities/contrato-item.entity';
import { Volumen } from '../calculo/entities/volumen.entity';
import { AuditoriaCambio } from '../auditoria/entities/auditoria-cambio.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';

const SUFIJOS = new Set(['SA', 'SAS', 'SAAS', 'LTDA', 'ESE', 'EPS', 'IPS', 'CIA', 'SUCURSAL', 'COLOMBIA', 'S', 'A', 'DE', 'Y', 'EN', 'LA', 'EL']);

function tokens(nombre: string): Set<string> {
  const limpio = nombre
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ');
  return new Set(limpio.split(/\s+/).filter((t) => t.length > 1 && !SUFIJOS.has(t)));
}

/** Similitud de Jaccard sobre tokens de los nombres (0..1). */
function similitud(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export interface Sugerencia {
  pendiente: { id: number; razonSocial: string; nit: string };
  contratos: number;
  candidatos: { id: number; razonSocial: string; nit: string; score: number }[];
}

@Injectable()
export class ReconciliacionService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Cliente) private readonly clientesRepo: Repository<Cliente>,
    @InjectRepository(Contrato) private readonly contratosRepo: Repository<Contrato>,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Para cada cliente con NIT placeholder, sugiere los clientes reales más parecidos. */
  async sugerencias(): Promise<Sugerencia[]> {
    const pendientes = await this.clientesRepo.find({ where: { nit: Like('PEND-%') }, order: { razonSocial: 'ASC' } });
    const reales = await this.clientesRepo.find({ where: { nit: Not(Like('PEND-%')) } });

    const out: Sugerencia[] = [];
    for (const p of pendientes) {
      const contratos = await this.contratosRepo.count({ where: { clienteId: p.id } });
      const candidatos = reales
        .map((r) => ({ id: r.id, razonSocial: r.razonSocial, nit: r.nit, score: similitud(p.razonSocial, r.razonSocial) }))
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);
      out.push({ pendiente: { id: p.id, razonSocial: p.razonSocial, nit: p.nit }, contratos, candidatos });
    }
    return out;
  }

  /**
   * Fusiona el cliente placeholder en el cliente real: mueve los contratos al
   * real, reengancha los volúmenes a la tarifa, y elimina el placeholder.
   * Transaccional y auditado.
   */
  async confirmar(pendClienteId: number, realClienteId: number, usuario: string): Promise<{ contratosMovidos: number; volumenesEnlazados: number }> {
    if (pendClienteId === realClienteId) {
      throw new BadRequestException('El cliente placeholder y el real no pueden ser el mismo.');
    }
    const pend = await this.clientesRepo.findOne({ where: { id: pendClienteId } });
    const real = await this.clientesRepo.findOne({ where: { id: realClienteId } });
    if (!pend || !real) throw new NotFoundException('Cliente no encontrado.');
    if (!pend.nit.startsWith('PEND-')) throw new BadRequestException('El primer cliente no es un placeholder.');
    if (real.nit.startsWith('PEND-')) throw new BadRequestException('El cliente destino no tiene NIT real.');

    let contratosMovidos = 0;
    let volumenesEnlazados = 0;

    await this.dataSource.transaction(async (manager) => {
      // 1. Mover los contratos del placeholder al cliente real
      const contratos = await manager.getRepository(Contrato).find({ where: { clienteId: pend.id } });
      for (const c of contratos) {
        c.clienteId = real.id;
        await manager.getRepository(Contrato).save(c);
      }
      contratosMovidos = contratos.length;

      // 2. Reenganchar los volúmenes del cliente real que no tienen tarifa
      const volumenes = await manager.getRepository(Volumen).find({ where: { clienteId: real.id } });
      for (const v of volumenes) {
        if (v.contratoItemId) continue;
        const item = await manager
          .getRepository(ContratoItem)
          .createQueryBuilder('ci')
          .innerJoin('ci.contrato', 'co')
          .innerJoin('ci.conceptos', 'cc')
          .where('co.cliente_id = :cid AND cc.producto_id = :pid AND cc.concepto_id = :coid', {
            cid: real.id,
            pid: v.productoId,
            coid: v.conceptoId,
          })
          .getOne();
        if (item) {
          v.contratoItemId = item.id;
          await manager.getRepository(Volumen).save(v);
          volumenesEnlazados++;
        }
      }

      // 3. Auditar y eliminar el placeholder
      await this.auditoria.registrar(
        {
          tabla: 'clientes',
          registroId: real.id,
          usuario,
          accion: 'UPDATE',
          valorAnterior: { fusion: 'placeholder', pendId: pend.id, pendNit: pend.nit },
          valorNuevo: { realId: real.id, realNit: real.nit, contratosMovidos, volumenesEnlazados },
        },
        manager.getRepository(AuditoriaCambio),
      );
      await manager.getRepository(Cliente).delete(pend.id);
    });

    return { contratosMovidos, volumenesEnlazados };
  }
}
