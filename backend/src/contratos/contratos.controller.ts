import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContratosService } from './contratos.service';
import { CreateContratoDto } from './dto/create-contrato.dto';
import { UpdateContratoDto } from './dto/update-contrato.dto';
import { ListContratosQueryDto } from './dto/list-contratos-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Contratos')
@Controller('contratos')
export class ContratosController {
  constructor(private readonly contratosService: ContratosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar contratos (filtrable por producto/modelo/estado/búsqueda, paginado)' })
  findAll(@Query() query: ListContratosQueryDto) {
    return this.contratosService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ficha completa del contrato (items y tarifas)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contratosService.findOne(id);
  }

  @Post()
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Crear contrato con items y tarifas (transaccional)' })
  create(@Body() dto: CreateContratoDto, @CurrentUser() usuario: string) {
    return this.contratosService.create(dto, usuario);
  }

  @Patch(':id')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Editar la cabecera del contrato (incl. baja lógica vía estado)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContratoDto,
    @CurrentUser() usuario: string,
  ) {
    return this.contratosService.update(id, dto, usuario);
  }
}
