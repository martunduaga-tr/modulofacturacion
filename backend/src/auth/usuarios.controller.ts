import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { Roles } from './decorators/roles.decorator';

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
  @ApiOperation({ summary: 'Crear usuario (solo administrador)' })
  create(@Body() dto: CreateUsuarioDto) {
    return this.usuariosService.create(dto);
  }
}
