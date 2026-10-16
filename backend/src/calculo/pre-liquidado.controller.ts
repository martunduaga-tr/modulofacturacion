import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PreLiquidadoService } from './pre-liquidado.service';
import { CalcularPeriodoDto } from './dto/calcular-periodo.dto';
import { ListPreliquidadosQueryDto } from './dto/list-preliquidados-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Pre-liquidados (Etapa 3)')
@Controller('pre-liquidados')
export class PreLiquidadoController {
  constructor(private readonly service: PreLiquidadoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar pre-liquidados (filtrable por periodo/estado, paginado)' })
  findAll(@Query() query: ListPreliquidadosQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver un pre-liquidado con su desglose completo' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post('calcular')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Correr el motor para un periodo (genera los pre-liquidados)' })
  calcular(@Body() dto: CalcularPeriodoDto) {
    return this.service.calcularPeriodo(dto);
  }

  @Patch(':id/aprobar')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Aprobar un pre-liquidado (gate humano previo a la emisión)' })
  aprobar(@Param('id', ParseIntPipe) id: number, @CurrentUser() usuario: string) {
    return this.service.aprobar(id, usuario);
  }
}
