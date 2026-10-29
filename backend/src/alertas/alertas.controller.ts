import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AlertasService } from './alertas.service';
import { ListAlertasQueryDto } from './dto/list-alertas-query.dto';
import { RevisarAlertaDto } from './dto/revisar-alerta.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Alertas')
@Controller('alertas')
export class AlertasController {
  constructor(private readonly service: AlertasService) {}

  @Get()
  @ApiOperation({ summary: 'Clientes/contratos desactualizados, por vencer o con datos incompletos (filtrable por tipo/severidad)' })
  findAll(@Query() query: ListAlertasQueryDto) {
    return this.service.generar(query);
  }

  @Post('revision')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Marcar una alerta de variación como revisada, con motivo (queda en auditoría)' })
  revisar(@Body() dto: RevisarAlertaDto, @CurrentUser() usuario: string) {
    return this.service.revisar(dto, usuario);
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Solo los conteos de alertas (para el indicador del menú)' })
  resumen() {
    return this.service.resumen();
  }
}
