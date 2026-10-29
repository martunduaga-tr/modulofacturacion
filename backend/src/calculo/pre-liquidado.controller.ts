import { FacturarPreliquidadoDto } from './dto/facturar-preliquidado.dto';
import { Body, Controller, Get, Header, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PreLiquidadoService } from './pre-liquidado.service';
import { ExportarCobrosService } from './exportar-cobros.service';
import { ExportarCobrosDto } from './dto/exportar-cobros.dto';
import { CalcularPeriodoDto } from './dto/calcular-periodo.dto';
import { ListPreliquidadosQueryDto } from './dto/list-preliquidados-query.dto';
import { RechazarPreliquidadoDto } from './dto/rechazar-preliquidado.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Pre-liquidados (Etapa 3)')
@Controller('pre-liquidados')
export class PreLiquidadoController {
  constructor(
    private readonly service: PreLiquidadoService,
    private readonly exportar: ExportarCobrosService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar pre-liquidados (filtrable por periodo/estado, paginado)' })
  findAll(@Query() query: ListPreliquidadosQueryDto) {
    return this.service.findAll(query);
  }

  // Antes de ':id' para que Nest no lo tome como un id.
  @Get('ultimo-periodo')
  @ApiOperation({ summary: 'Último periodo (año y mes) con pre-liquidados; null si no hay ninguno' })
  ultimoPeriodo() {
    return this.service.ultimoPeriodo();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver un pre-liquidado con su desglose completo' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post('exportar')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'CSV de los cobros indicados (para digitar o cargar las facturas en iFactura)' })
  exportarCsv(@Body() dto: ExportarCobrosDto) {
    return this.exportar.csv(dto.ids);
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

  @Patch(':id/facturar')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Marcar como facturado con la fecha de la factura (USD: fija la TRM de ese día)' })
  facturar(@Param('id', ParseIntPipe) id: number, @Body() dto: FacturarPreliquidadoDto, @CurrentUser() usuario: string) {
    return this.service.facturar(id, dto, usuario);
  }

  @Patch(':id/rechazar')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Rechazar un pre-liquidado con motivo (gate humano)' })
  rechazar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RechazarPreliquidadoDto,
    @CurrentUser() usuario: string,
  ) {
    return this.service.rechazar(id, usuario, dto.motivo);
  }
}
