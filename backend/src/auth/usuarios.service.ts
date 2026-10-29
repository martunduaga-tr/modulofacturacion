import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Usuario, EstadoUsuario } from './entities/usuario.entity';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { isUniqueViolation } from '../common/database/unique-violation';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class UsuariosService implements OnModuleInit {
  private readonly logger = new Logger(UsuariosService.name);
  private static readonly SALT_ROUNDS = 10;

  constructor(
    @InjectRepository(Usuario)
    private readonly usuariosRepo: Repository<Usuario>,
    private readonly config: ConfigService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Primer arranque: crea el administrador inicial. Después: si el admin sigue con la clave
   * por defecto, se le exige cambiarla (esa clave está escrita en la documentación).
   */
  async onModuleInit(): Promise<void> {
    const password = this.config.get<string>('ADMIN_PASSWORD') ?? 'Admin123*';
    const total = await this.usuariosRepo.count();
    if (total === 0) {
      const passwordHash = await bcrypt.hash(password, UsuariosService.SALT_ROUNDS);
      await this.usuariosRepo.save(
        this.usuariosRepo.create({
          username: 'admin',
          nombre: 'Administrador',
          passwordHash,
          rol: 'administrador',
          debeCambiarClave: true,
        }),
      );
      this.logger.warn("Usuario 'admin' creado con la clave por defecto: se pedirá cambiarla al entrar.");
      return;
    }
    const admin = await this.findByUsernameConHash('admin');
    if (admin && !admin.debeCambiarClave && (await bcrypt.compare(password, admin.passwordHash))) {
      await this.usuariosRepo.update(admin.id, { debeCambiarClave: true });
      this.logger.warn("El usuario 'admin' sigue con la clave por defecto: se pedirá cambiarla al entrar.");
    }
  }

  /** Incluye el passwordHash (la columna es select:false por defecto). */
  findByUsernameConHash(username: string): Promise<Usuario | null> {
    return this.usuariosRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.username = :username', { username })
      .getOne();
  }

  findById(id: number): Promise<Usuario | null> {
    return this.usuariosRepo.findOne({ where: { id } });
  }

  findAll(): Promise<Usuario[]> {
    return this.usuariosRepo.find({ order: { username: 'ASC' } });
  }

  /** La clave que pone el administrador es temporal: el usuario la cambia al entrar. */
  async create(dto: CreateUsuarioDto, actor = 'sistema'): Promise<Usuario> {
    const passwordHash = await bcrypt.hash(dto.password, UsuariosService.SALT_ROUNDS);
    const usuario = this.usuariosRepo.create({
      username: dto.username.trim(),
      nombre: dto.nombre,
      email: dto.email ?? null,
      passwordHash,
      rol: dto.rol,
      debeCambiarClave: true,
    });
    try {
      const guardado = await this.usuariosRepo.save(usuario);
      // No exponer el hash en la respuesta
      delete (guardado as Partial<Usuario>).passwordHash;
      await this.auditoria.registrar({
        tabla: 'usuarios', registroId: guardado.id, usuario: actor, accion: 'INSERT',
        valorNuevo: { username: guardado.username, nombre: guardado.nombre, rol: guardado.rol, claveTemporal: true },
      });
      return guardado;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Ya existe un usuario con el username '${dto.username}'`);
      }
      throw error;
    }
  }

  /** El propio usuario cambia su clave (obligatorio si tiene una temporal). */
  async cambiarClave(id: number, actual: string, nueva: string): Promise<Usuario> {
    const usuario = await this.usuariosRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id })
      .getOne();
    if (!usuario || usuario.estado !== 'activo') throw new UnauthorizedException('Sesión no válida');
    const eraTemporal = usuario.debeCambiarClave;
    if (!(await bcrypt.compare(actual, usuario.passwordHash))) {
      throw new BadRequestException('La clave actual no es correcta');
    }
    if (actual === nueva) throw new BadRequestException('La clave nueva debe ser distinta de la actual');
    const passwordHash = await bcrypt.hash(nueva, UsuariosService.SALT_ROUNDS);
    await this.usuariosRepo.update(id, { passwordHash, debeCambiarClave: false });
    await this.auditoria.registrar({
      tabla: 'usuarios', registroId: id, usuario: usuario.username, accion: 'UPDATE',
      valorAnterior: { claveTemporal: eraTemporal }, valorNuevo: { claveCambiadaPorElUsuario: true },
    });
    return (await this.findById(id))!;
  }

  /** El administrador asigna una clave temporal (olvido, o primer acceso). */
  async restablecerClave(id: number, password: string, actor: string): Promise<Usuario> {
    const usuario = await this.encontrar(id);
    const passwordHash = await bcrypt.hash(password, UsuariosService.SALT_ROUNDS);
    await this.usuariosRepo.update(id, { passwordHash, debeCambiarClave: true });
    await this.auditoria.registrar({
      tabla: 'usuarios', registroId: id, usuario: actor, accion: 'UPDATE',
      valorNuevo: { claveRestablecida: true, claveTemporal: true },
    });
    return { ...usuario, debeCambiarClave: true };
  }

  /** Desactivar a quien se va (no se borra: su historial en auditoría sigue teniendo dueño). */
  async cambiarEstado(id: number, estado: EstadoUsuario, actor: { id: number; username: string }): Promise<Usuario> {
    if (id === actor.id && estado === 'inactivo') {
      throw new BadRequestException('No puede desactivar su propio usuario');
    }
    const usuario = await this.encontrar(id);
    if (usuario.estado === estado) return usuario;
    if (estado === 'inactivo' && usuario.rol === 'administrador') {
      const admins = await this.usuariosRepo.count({ where: { rol: 'administrador', estado: 'activo' } });
      if (admins <= 1) throw new BadRequestException('Debe quedar al menos un administrador activo');
    }
    const anterior = usuario.estado;
    await this.usuariosRepo.update(id, { estado });
    await this.auditoria.registrar({
      tabla: 'usuarios', registroId: id, usuario: actor.username, accion: 'UPDATE',
      valorAnterior: { estado: anterior }, valorNuevo: { estado },
    });
    return { ...usuario, estado };
  }

  private async encontrar(id: number): Promise<Usuario> {
    const usuario = await this.findById(id);
    if (!usuario) throw new NotFoundException(`No existe el usuario ${id}`);
    return usuario;
  }
}
