import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FacturacionService } from './facturacion.service';
import { CreateLineaDto } from './dto/create-linea.dto';
import { UpdateLineaDto } from './dto/update-linea.dto';
import { ListLineasQueryDto } from './dto/list-lineas-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Maestro de facturación')
@Controller('lineas-facturacion')
export class FacturacionController {
  constructor(private readonly facturacionService: FacturacionService) {}

  @Get()
  @ApiOperation({ summary: 'Listar líneas del maestro de facturación (filtrable, paginado)' })
  findAll(@Query() query: ListLineasQueryDto) {
    return this.facturacionService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver una línea de facturación' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.facturacionService.findOne(id);
  }

  @Post()
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Crear una línea del maestro de facturación' })
  create(@Body() dto: CreateLineaDto, @CurrentUser() usuario: string) {
    return this.facturacionService.create(dto, usuario);
  }

  @Patch(':id')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Editar una línea del maestro de facturación' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLineaDto,
    @CurrentUser() usuario: string,
  ) {
    return this.facturacionService.update(id, dto, usuario);
  }
}
