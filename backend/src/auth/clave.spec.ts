import { BadRequestException, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { UsuariosService } from './usuarios.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PERMITE_CLAVE_TEMPORAL_KEY } from './decorators/clave-temporal.decorator';
import { Usuario } from './entities/usuario.entity';

/** Repositorio en memoria con lo que usa UsuariosService. */
function repoDe(usuarios: Usuario[]) {
  const qb = (filtro: (u: Usuario) => boolean) => ({
    addSelect: () => qb(filtro),
    where: (_: string, p: { id?: number; username?: string }) =>
      qb((u) => (p.id !== undefined ? u.id === p.id : u.username === p.username)),
    getOne: async () => usuarios.find(filtro) ?? null,
  });
  return {
    createQueryBuilder: () => qb(() => true),
    findOne: async ({ where }: { where: { id: number } }) => usuarios.find((u) => u.id === where.id) ?? null,
    update: async (id: number, cambios: Partial<Usuario>) => Object.assign(usuarios.find((u) => u.id === id)!, cambios),
    count: async ({ where }: { where: Partial<Usuario> }) =>
      usuarios.filter((u) => Object.entries(where).every(([k, v]) => u[k as keyof Usuario] === v)).length,
  };
}

describe('Clave temporal y estado de usuarios', () => {
  let usuarios: Usuario[];
  let servicio: UsuariosService;
  let auditoria: { registrar: jest.Mock };

  beforeEach(async () => {
    const hash = await bcrypt.hash('Temporal1*', 4);
    usuarios = [
      { id: 1, username: 'admin', nombre: 'Administrador', email: null, passwordHash: hash, rol: 'administrador', estado: 'activo', debeCambiarClave: false, fechaCreacion: new Date() },
      { id: 2, username: 'james', nombre: 'James', email: null, passwordHash: hash, rol: 'editor', estado: 'activo', debeCambiarClave: true, fechaCreacion: new Date() },
    ];
    auditoria = { registrar: jest.fn() };
    servicio = new UsuariosService(repoDe(usuarios) as never, { get: () => undefined } as never, auditoria as never);
  });

  it('cambiar la clave temporal la reemplaza, quita la marca y queda en auditoría sin la clave', async () => {
    const r = await servicio.cambiarClave(2, 'Temporal1*', 'MiClaveNueva9');
    expect(r.debeCambiarClave).toBe(false);
    expect(await bcrypt.compare('MiClaveNueva9', usuarios[1].passwordHash)).toBe(true);
    const registro = JSON.stringify(auditoria.registrar.mock.calls[0][0]);
    expect(registro).not.toContain('MiClaveNueva9');
    expect(registro).not.toContain('Temporal1*');
  });

  it('rechaza la clave actual equivocada y la nueva igual a la actual', async () => {
    await expect(servicio.cambiarClave(2, 'otra', 'MiClaveNueva9')).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio.cambiarClave(2, 'Temporal1*', 'Temporal1*')).rejects.toBeInstanceOf(BadRequestException);
    expect(usuarios[1].debeCambiarClave).toBe(true);
  });

  it('restablecer pone una clave temporal y vuelve a exigir el cambio', async () => {
    usuarios[1].debeCambiarClave = false;
    await servicio.restablecerClave(2, 'OtraTemporal2', 'admin');
    expect(usuarios[1].debeCambiarClave).toBe(true);
    expect(await bcrypt.compare('OtraTemporal2', usuarios[1].passwordHash)).toBe(true);
  });

  it('desactivar: no a sí mismo ni al último administrador; sí a un editor, y queda en auditoría', async () => {
    await expect(servicio.cambiarEstado(1, 'inactivo', { id: 1, username: 'admin' })).rejects.toBeInstanceOf(BadRequestException);
    usuarios.push({ ...usuarios[0], id: 3, username: 'otro' });
    await expect(servicio.cambiarEstado(1, 'inactivo', { id: 3, username: 'otro' })).resolves.toMatchObject({ estado: 'inactivo' });
    await expect(servicio.cambiarEstado(3, 'inactivo', { id: 2, username: 'james' })).rejects.toThrow('al menos un administrador');
    await servicio.cambiarEstado(2, 'inactivo', { id: 3, username: 'otro' });
    expect(usuarios[1].estado).toBe('inactivo');
    expect(auditoria.registrar).toHaveBeenLastCalledWith(expect.objectContaining({ valorAnterior: { estado: 'activo' }, valorNuevo: { estado: 'inactivo' } }));
  });

  it('con clave temporal el guard solo deja pasar los endpoints marcados', async () => {
    const reflector = new Reflector();
    const guard = new JwtAuthGuard(reflector);
    // La validación del token (passport) se da por hecha: aquí importa la regla de la clave temporal.
    jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate').mockResolvedValue(true);
    const contexto = (permite: boolean, debeCambiarClave: boolean) => {
      const handler = () => undefined;
      if (permite) Reflect.defineMetadata(PERMITE_CLAVE_TEMPORAL_KEY, true, handler);
      return {
        getHandler: () => handler,
        getClass: () => class {},
        switchToHttp: () => ({ getRequest: () => ({ user: { id: 2, username: 'james', rol: 'editor', debeCambiarClave } }) }),
      } as unknown as ExecutionContext;
    };
    await expect(guard.canActivate(contexto(false, true))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(contexto(true, true))).resolves.toBe(true);
    await expect(guard.canActivate(contexto(false, false))).resolves.toBe(true);
  });
});
