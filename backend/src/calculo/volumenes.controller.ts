import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { VolumenesService } from './volumenes.service';
import { IngestaVolumenesDto } from './dto/ingesta-volumenes.dto';
import { ListVolumenesQueryDto } from './dto/list-volumenes-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Volúmenes (Etapa 3)')
@Controller('volumenes')
export class VolumenesController {
  constructor(private readonly volumenesService: VolumenesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar volúmenes cargados (filtrable por año/mes, paginado)' })
  findAll(@Query() query: ListVolumenesQueryDto) {
    return this.volumenesService.findAll(query);
  }

  @Post('ingesta')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Cargar volúmenes en lote (resuelve cliente/producto/concepto por código)' })
  ingesta(@Body() dto: IngestaVolumenesDto) {
    return this.volumenesService.ingesta(dto);
  }
}
