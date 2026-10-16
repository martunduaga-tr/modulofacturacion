import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditoriaService } from './auditoria.service';
import { ListAuditoriaQueryDto } from './dto/list-auditoria-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Auditoría')
@Roles('administrador')
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Get()
  @ApiOperation({ summary: 'Consultar el registro de cambios (filtrable por tabla y rango de fechas)' })
  findAll(@Query() query: ListAuditoriaQueryDto) {
    return this.auditoriaService.findAll(query);
  }
}
