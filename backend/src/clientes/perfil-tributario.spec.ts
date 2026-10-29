import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClientesService } from './clientes.service';
import { PerfilTributarioDto } from './dto/perfil-tributario.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import type { Cliente } from './entities/cliente.entity';
import { resumirSegmento } from './segmento';

describe('Perfil tributario del cliente', () => {
  const cliente = { id: 7, nit: '860070374', segmento: 'CORPORATIVO', tasaRtefte: null, tasaRteiva: null, tasaRteica: null } as unknown as Cliente;
  const repo = { findOne: jest.fn().mockResolvedValue(cliente), save: jest.fn().mockImplementation(async (c) => c) };
  const auditoria = { registrar: jest.fn() };
  const service = new ClientesService(repo as never, {} as never, auditoria as never);

  it('guarda las retenciones y deja en auditoría el valor anterior y el nuevo', async () => {
    const dto: PerfilTributarioDto = { tasaRtefte: 0.035, tasaRteiva: 0.15, tasaRteica: 0 };
    const r = await service.actualizarPerfilTributario(7, dto, 'contabilidad');
    expect(r).toMatchObject({ tasaRtefte: 0.035, tasaRteiva: 0.15, tasaRteica: 0 });
    expect(auditoria.registrar).toHaveBeenCalledWith(expect.objectContaining({
      tabla: 'clientes', registroId: 7, usuario: 'contabilidad', accion: 'UPDATE',
      valorAnterior: { tasaRtefte: null, tasaRteiva: null, tasaRteica: null },
    }));
  });

  it('valida: tasas obligatorias, en fracción y sin negativos', async () => {
    const errores = async (o: object) => (await validate(plainToInstance(PerfilTributarioDto, o))).map((e) => e.property);
    expect(await errores({ tasaRtefte: 0.035, tasaRteiva: 0, tasaRteica: 0.00966 })).toEqual([]);
    expect(await errores({ tasaRtefte: 3.5, tasaRteiva: -1 })).toEqual(['tasaRtefte', 'tasaRteiva', 'tasaRteica']);
  });

  it('el segmento sale de los contratos: CORPORATIVO, EXPRESS o AMBOS (ALKA MOTOR)', () => {
    expect(resumirSegmento(['CORPORATIVO'])).toBe('CORPORATIVO');
    expect(resumirSegmento(['EXPRESS', 'EXPRESS', 'EXPRESS'])).toBe('EXPRESS');
    expect(resumirSegmento(['CORPORATIVO', 'EXPRESS', 'EXPRESS', 'EXPRESS'])).toBe('AMBOS');
    expect(resumirSegmento([])).toBeNull();
  });

  it('el endpoint de retenciones no acepta segmento: es de cada contrato', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const meta = { type: 'body' as const, metatype: PerfilTributarioDto };
    await expect(pipe.transform({ segmento: 'EXPRESS', tasaRtefte: 0, tasaRteiva: 0, tasaRteica: 0 }, meta)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el PATCH general del cliente rechaza retenciones: solo entran por el endpoint auditado', async () => {
    // Misma configuración del ValidationPipe global (main.ts).
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const meta = { type: 'body' as const, metatype: UpdateClienteDto };
    await expect(pipe.transform({ tasaRtefte: 0.04 }, meta)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ segmento: 'EXPRESS' }, meta)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ razonSocial: 'CONFIANZA' }, meta)).resolves.toBeDefined();
  });
});
