import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ListClientesQueryDto } from './dto/list-clientes-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';

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
}
