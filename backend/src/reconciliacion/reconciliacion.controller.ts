import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ReconciliacionService } from './reconciliacion.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class ConfirmarDto {
  @Type(() => Number)
  @IsInt()
  pendClienteId: number;

  @Type(() => Number)
  @IsInt()
  realClienteId: number;
}

@ApiTags('Reconciliación de clientes')
@Roles('administrador')
@Controller('reconciliacion')
export class ReconciliacionController {
  constructor(private readonly service: ReconciliacionService) {}

  @Get('sugerencias')
  @ApiOperation({ summary: 'Sugerencias de cruce placeholder→NIT real (por nombre)' })
  sugerencias() {
    return this.service.sugerencias();
  }

  @Post('confirmar')
  @ApiOperation({ summary: 'Fusionar el cliente placeholder en el cliente real (mueve tarifas, reengancha volúmenes)' })
  confirmar(@Body() dto: ConfirmarDto, @CurrentUser() usuario: string) {
    return this.service.confirmar(dto.pendClienteId, dto.realClienteId, usuario);
  }
}
