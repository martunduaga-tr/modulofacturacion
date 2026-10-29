import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { EstadoUsuarioDto, RestablecerClaveDto } from './dto/clave.dto';
import { Roles } from './decorators/roles.decorator';
import { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('Usuarios')
@Roles('administrador')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios (solo administrador)' })
  findAll() {
    return this.usuariosService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Crear usuario con clave temporal (solo administrador)' })
  create(@Body() dto: CreateUsuarioDto, @Req() req: { user: AuthUser }) {
    return this.usuariosService.create(dto, req.user.username);
  }

  @Patch(':id/restablecer-clave')
  @ApiOperation({ summary: 'Asignar una clave temporal; el usuario la cambia al entrar' })
  restablecerClave(@Param('id', ParseIntPipe) id: number, @Body() dto: RestablecerClaveDto, @Req() req: { user: AuthUser }) {
    return this.usuariosService.restablecerClave(id, dto.password, req.user.username);
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Activar o desactivar un usuario (quien se va de la empresa se desactiva, no se borra)' })
  cambiarEstado(@Param('id', ParseIntPipe) id: number, @Body() dto: EstadoUsuarioDto, @Req() req: { user: AuthUser }) {
    return this.usuariosService.cambiarEstado(id, dto.estado, req.user);
  }
}
