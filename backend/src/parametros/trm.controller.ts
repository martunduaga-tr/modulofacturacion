import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Matches, Min } from 'class-validator';
import { TrmService } from './trm.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class FechaTrmQuery {
  @ApiProperty({ example: '2026-10-27' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe ser AAAA-MM-DD' })
  fecha: string;
}

class TrmManualDto extends FechaTrmQuery {
  @ApiProperty({ example: 3157.94 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'valor debe ser numérico (hasta 6 decimales)' })
  @Min(0.000001, { message: 'La TRM debe ser mayor que 0' })
  valor: number;
}

@ApiTags('TRM')
@Controller('trm')
export class TrmController {
  constructor(private readonly trm: TrmService) {}

  @Get()
  @ApiOperation({ summary: 'TRM de una fecha (la guardada o la de datos.gov.co)' })
  deFecha(@Query() q: FechaTrmQuery) {
    return this.trm.deFecha(q.fecha);
  }

  @Put()
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Digitar la TRM de una fecha (reemplaza la consultada; queda en auditoría)' })
  manual(@Body() dto: TrmManualDto, @CurrentUser() usuario: string) {
    return this.trm.registrarManual(dto.fecha, dto.valor, usuario);
  }
}
