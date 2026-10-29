import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClientesService } from './clientes.service';
import { ComentarioFacturaDto } from './dto/comentario-factura.dto';
import type { Cliente } from './entities/cliente.entity';
import type { ComentarioFactura } from './entities/comentario-factura.entity';

describe('Comentario de la línea de factura', () => {
  const cliente = { id: 7, nit: '860002184' } as unknown as Cliente;
  let filas: ComentarioFactura[];
  const comentarios = {
    findOne: jest.fn(async ({ where }) => filas.find((f) => f.clienteId === where.clienteId && f.clasificador === where.clasificador) ?? null),
    create: jest.fn((o) => ({ ...o })),
    merge: jest.fn((a, b) => Object.assign(a, b)),
    save: jest.fn(async (o) => {
      if (!o.id) { o.id = filas.length + 1; filas.push(o); }
      return o;
    }),
    delete: jest.fn(async (id) => { filas = filas.filter((f) => f.id !== id); }),
  };
  const auditoria = { registrar: jest.fn() };
  const service = new ClientesService({ findOne: jest.fn().mockResolvedValue(cliente) } as never, comentarios as never, auditoria as never);

  beforeEach(() => { filas = []; auditoria.registrar.mockClear(); });

  it('precarga del historial y edición de Contabilidad quedan en auditoría', async () => {
    await service.guardarComentarioFactura(7, { clasificador: 'Emisión', comentario: '(Contrato No. SG-07-2018)  Funcionario' }, 'carga', 'historial');
    expect(filas[0]).toMatchObject({ clasificador: 'Emisión', comentario: '(Contrato No. SG-07-2018) Funcionario', origen: 'historial' });
    expect(auditoria.registrar).toHaveBeenLastCalledWith(expect.objectContaining({ accion: 'INSERT', tabla: 'cliente_comentarios_factura' }));

    await service.guardarComentarioFactura(7, { clasificador: 'Emisión', comentario: 'Contrato SG-07-2018' }, 'contabilidad');
    expect(filas[0]).toMatchObject({ comentario: 'Contrato SG-07-2018', origen: 'manual' });
    expect(auditoria.registrar).toHaveBeenLastCalledWith(expect.objectContaining({
      accion: 'UPDATE', valorAnterior: { clasificador: 'Emisión', comentario: '(Contrato No. SG-07-2018) Funcionario' },
    }));
  });

  it('sin cambios no escribe; vacío borra', async () => {
    await service.guardarComentarioFactura(7, { clasificador: 'Recepción', comentario: 'OC 123' }, 'contabilidad');
    auditoria.registrar.mockClear();
    await service.guardarComentarioFactura(7, { clasificador: 'Recepción', comentario: ' OC 123 ' }, 'contabilidad');
    expect(auditoria.registrar).not.toHaveBeenCalled();

    await service.guardarComentarioFactura(7, { clasificador: 'Recepción', comentario: '  ' }, 'contabilidad');
    expect(filas).toHaveLength(0);
    expect(auditoria.registrar).toHaveBeenLastCalledWith(expect.objectContaining({ accion: 'DELETE' }));
  });

  it('solo acepta las hojas de negocio', async () => {
    const errores = async (o: object) => (await validate(plainToInstance(ComentarioFacturaDto, o))).map((e) => e.property);
    expect(await errores({ clasificador: 'Emisión - Recepción', comentario: 'x' })).toEqual([]);
    expect(await errores({ clasificador: 'Doc Soporte', comentario: 'x' })).toEqual([]);
    expect(await errores({ clasificador: 'iSoat - Mail', comentario: 'x'.repeat(501) })).toEqual(['clasificador', 'comentario']);
  });
});
