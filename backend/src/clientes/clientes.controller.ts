import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ListClientesQueryDto } from './dto/list-clientes-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PerfilTributarioDto } from './dto/perfil-tributario.dto';
import { ComentarioFacturaDto } from './dto/comentario-factura.dto';

@ApiTags('Clientes')
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar clientes (filtrable por NIT/razón social/estado, paginado)' })
  findAll(@Query() query: ListClientesQueryDto) {
    return this.clientesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver un cliente con sus contratos' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.findOne(id);
  }

  @Post()
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Crear un cliente' })
  create(@Body() dto: CreateClienteDto) {
    return this.clientesService.create(dto);
  }

  @Patch(':id')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Editar un cliente (incl. baja lógica vía estado)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClienteDto) {
    return this.clientesService.update(id, dto);
  }

  @Patch(':id/perfil-tributario')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Editar las retenciones del cliente (queda en auditoría)' })
  perfilTributario(@Param('id', ParseIntPipe) id: number, @Body() dto: PerfilTributarioDto, @CurrentUser() usuario: string) {
    return this.clientesService.actualizarPerfilTributario(id, dto, usuario);
  }

  @Get(':id/comentarios-factura')
  @ApiOperation({ summary: 'Comentarios de la línea de factura del cliente, por clasificador' })
  comentariosFactura(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.comentariosFactura(id);
  }

  @Put(':id/comentarios-factura')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Guardar el comentario de un clasificador (vacío = borrar; queda en auditoría)' })
  guardarComentarioFactura(@Param('id', ParseIntPipe) id: number, @Body() dto: ComentarioFacturaDto, @CurrentUser() usuario: string) {
    return this.clientesService.guardarComentarioFactura(id, dto, usuario);
  }
}
