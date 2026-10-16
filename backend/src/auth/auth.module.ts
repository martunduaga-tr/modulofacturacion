import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from './entities/usuario.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'cambiar-este-secreto',
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '8h' },
      }),
    }),
  ],
  controllers: [AuthController, UsuariosController],
  providers: [
    AuthService,
    UsuariosService,
    JwtStrategy,
    // Guards globales: primero autentica (JWT), luego verifica rol.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [UsuariosService],
})
export class AuthModule {}
