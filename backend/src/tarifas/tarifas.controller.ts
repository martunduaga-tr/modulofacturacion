import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TarifasService } from './tarifas.service';
import { TarifaAnioDto } from './dto/tarifa-anio.dto';
import { SetEscalonesDto } from './dto/set-escalones.dto';
import { SetRecargosDto } from './dto/set-recargos.dto';
import { UpdateEscalonDto } from './dto/update-escalon.dto';
import { UpdateMinimoDto } from './dto/update-minimo.dto';
import { UpdateFijaDto } from './dto/update-fija.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Tarifas')
@Controller()
export class TarifasController {
  constructor(private readonly tarifasService: TarifasService) {}

  @Get('contrato-items/:id/tarifas')
  @ApiOperation({ summary: 'Ver las tarifas de un item (escalones/mínimo/fija), filtrable por año' })
  getByItem(
    @Param('id', ParseIntPipe) id: number,
    @Query('anio') anio?: string,
  ) {
    return this.tarifasService.getByItem(id, anio ? parseInt(anio, 10) : undefined);
  }

  @Post('contrato-items/:id/escalones')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Definir/reemplazar los escalones de un item para un año' })
  setEscalones(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetEscalonesDto,
    @CurrentUser() usuario: string,
  ) {
    return this.tarifasService.setEscalones(id, dto, usuario);
  }

  @Post('contrato-items/:id/anio')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'RF-5: agregar la tarifa de un nuevo año a un item' })
  agregarAnio(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TarifaAnioDto,
    @CurrentUser() usuario: string,
  ) {
    return this.tarifasService.agregarAnio(id, dto, usuario);
  }

  @Post('contrato-items/:id/recargos')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Definir/reemplazar los recargos fijos de un item para un año (ej. MANTENIMIENTO)' })
  setRecargos(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetRecargosDto,
    @CurrentUser() usuario: string,
  ) {
    return this.tarifasService.setRecargos(id, dto, usuario);
  }

  @Patch('escalones/:id')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'RF-4: editar un escalón (revalida la cobertura del año)' })
  updateEscalon(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEscalonDto,
    @CurrentUser() usuario: string,
  ) {
    return this.tarifasService.updateEscalon(id, dto, usuario);
  }

  @Patch('minimos/:id')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'RF-4: editar un mínimo garantizado' })
  updateMinimo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMinimoDto,
    @CurrentUser() usuario: string,
  ) {
    return this.tarifasService.updateMinimo(id, dto, usuario);
  }

  @Patch('tarifa-fija/:id')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'RF-4: editar una tarifa fija' })
  updateFija(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFijaDto,
    @CurrentUser() usuario: string,
  ) {
    return this.tarifasService.updateFija(id, dto, usuario);
  }
}
