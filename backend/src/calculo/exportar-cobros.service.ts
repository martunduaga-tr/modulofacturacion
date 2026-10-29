import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PreLiquidado } from './entities/pre-liquidado.entity';
import { ComentarioFactura } from '../clientes/entities/comentario-factura.entity';
import { clasificadorDe, FilaExportacion, generarCsv } from './exportar-csv';

const MAX_COBROS = 3000;

/** Fecha de factura como AAAA-MM-DD (la BD la devuelve como Date a medianoche de Bogotá). */
function fecha(v: string | Date | null): string | null {
  if (!v) return null;
  return typeof v === 'string' ? v.slice(0, 10) : v.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

@Injectable()
export class ExportarCobrosService {
  constructor(
    @InjectRepository(PreLiquidado) private readonly preRepo: Repository<PreLiquidado>,
    @InjectRepository(ComentarioFactura) private readonly comentariosRepo: Repository<ComentarioFactura>,
  ) {}

  /** CSV de los cobros pedidos (los que la pantalla tiene filtrados), en el orden de la pantalla. */
  async csv(ids: number[]): Promise<string> {
    if (!ids.length) throw new BadRequestException('No hay cobros para descargar');
    if (ids.length > MAX_COBROS) throw new BadRequestException(`Máximo ${MAX_COBROS} cobros por archivo`);
    const cobros: PreLiquidado[] = [];
    for (let i = 0; i < ids.length; i += 1000) {
      cobros.push(...(await this.preRepo.find({ where: { id: In(ids.slice(i, i + 1000)) }, relations: { cliente: true } })));
    }
    const clientes = [...new Set(cobros.map((p) => p.clienteId))];
    const comentarios = new Map<string, string>();
    for (let i = 0; i < clientes.length; i += 1000) {
      for (const c of await this.comentariosRepo.find({ where: { clienteId: In(clientes.slice(i, i + 1000)) } })) {
        comentarios.set(`${c.clienteId}|${c.clasificador}`, c.comentario);
      }
    }
    const orden = new Map(ids.map((id, i) => [id, i]));
    cobros.sort((a, b) => orden.get(a.id)! - orden.get(b.id)!);

    const filas: FilaExportacion[] = cobros.map((p) => {
      let servicios: string[] = [];
      try {
        servicios = (JSON.parse(p.desglose ?? '{}') as { servicios?: string[] }).servicios ?? [];
      } catch {
        /* desglose viejo sin servicios */
      }
      const clasificador = clasificadorDe(servicios);
      const total = p.totalFactura ?? p.total;
      return {
        periodo: `${p.anio}-${String(p.mes).padStart(2, '0')}`,
        estado: p.estado,
        nit: p.cliente.nit,
        razonSocial: p.cliente.razonSocial,
        servicios,
        comentario: clasificador ? comentarios.get(`${p.clienteId}|${clasificador}`) ?? null : null,
        cantidad: p.volumen,
        moneda: p.moneda,
        subtotal: p.subtotalFactura ?? p.subtotal,
        iva: p.ivaFactura ?? p.iva,
        total,
        rtefte: p.rtefte,
        rteiva: p.rteiva,
        rteica: p.rteica,
        // Lo que paga el cliente: el total de la factura (en pesos enteros) menos retenciones; igual que la pantalla.
        valorCartera: Math.round((total - p.rtefte - p.rteiva - p.rteica) * 100) / 100,
        trm: p.moneda === 'USD' ? p.trm : null,
        fechaFactura: fecha(p.fechaFactura as string | Date | null),
        aprobo: p.usuarioAprobo,
      };
    });
    return generarCsv(filas);
  }
}
