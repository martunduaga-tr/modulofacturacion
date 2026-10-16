import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParametrosService } from './parametros.service';
import { UpdateParametroDto } from './dto/update-parametro.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Parámetros globales')
@Controller('parametros')
export class ParametrosController {
  constructor(private readonly parametrosService: ParametrosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar parámetros vigentes (IVA, retenciones, IPC, TRM)' })
  findVigentes() {
    return this.parametrosService.findVigentes();
  }

  @Get(':clave/historial')
  @ApiOperation({ summary: 'Ver el historial de versiones de un parámetro' })
  historial(@Param('clave') clave: string) {
    return this.parametrosService.findHistorial(clave);
  }

  @Patch(':clave')
  @Roles('administrador')
  @ApiOperation({ summary: 'Fijar el valor de un parámetro para una vigencia' })
  update(
    @Param('clave') clave: string,
    @Body() dto: UpdateParametroDto,
    @CurrentUser() usuario: string,
  ) {
    return this.parametrosService.upsert(clave, dto, usuario);
  }
}
