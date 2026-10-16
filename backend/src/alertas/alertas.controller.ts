import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AlertasService } from './alertas.service';
import { ListAlertasQueryDto } from './dto/list-alertas-query.dto';

@ApiTags('Alertas')
@Controller('alertas')
export class AlertasController {
  constructor(private readonly service: AlertasService) {}

  @Get()
  @ApiOperation({ summary: 'Clientes/contratos desactualizados, por vencer o con datos incompletos (filtrable por tipo/severidad)' })
  findAll(@Query() query: ListAlertasQueryDto) {
    return this.service.generar(query);
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Solo los conteos de alertas (para el indicador del menú)' })
  resumen() {
    return this.service.resumen();
  }
}
