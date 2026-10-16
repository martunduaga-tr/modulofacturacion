import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Usuario } from './entities/usuario.entity';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { isUniqueViolation } from '../common/database/unique-violation';

@Injectable()
export class UsuariosService implements OnModuleInit {
  private readonly logger = new Logger(UsuariosService.name);
  private static readonly SALT_ROUNDS = 10;

  constructor(
    @InjectRepository(Usuario)
    private readonly usuariosRepo: Repository<Usuario>,
    private readonly config: ConfigService,
  ) {}

  /** Crea un administrador inicial si no hay usuarios (primer arranque). */
  async onModuleInit(): Promise<void> {
    const total = await this.usuariosRepo.count();
    if (total > 0) {
      return;
    }
    const password = this.config.get<string>('ADMIN_PASSWORD') ?? 'Admin123*';
    const passwordHash = await bcrypt.hash(password, UsuariosService.SALT_ROUNDS);
    await this.usuariosRepo.save(
      this.usuariosRepo.create({
        username: 'admin',
        nombre: 'Administrador',
        passwordHash,
        rol: 'administrador',
      }),
    );
    this.logger.warn(
      "Usuario 'admin' creado con contraseña por defecto. Cámbiela cuanto antes (ADMIN_PASSWORD).",
    );
  }

  /** Incluye el passwordHash (la columna es select:false por defecto). */
  findByUsernameConHash(username: string): Promise<Usuario | null> {
    return this.usuariosRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.username = :username', { username })
      .getOne();
  }

  findAll(): Promise<Usuario[]> {
    return this.usuariosRepo.find({ order: { username: 'ASC' } });
  }

  async create(dto: CreateUsuarioDto): Promise<Usuario> {
    const passwordHash = await bcrypt.hash(dto.password, UsuariosService.SALT_ROUNDS);
    const usuario = this.usuariosRepo.create({
      username: dto.username.trim(),
      nombre: dto.nombre,
      email: dto.email ?? null,
      passwordHash,
      rol: dto.rol,
    });
    try {
      const guardado = await this.usuariosRepo.save(usuario);
      // No exponer el hash en la respuesta
      delete (guardado as Partial<Usuario>).passwordHash;
      return guardado;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Ya existe un usuario con el username '${dto.username}'`);
      }
      throw error;
    }
  }
}
