import { BadRequestException, Controller, Get, Param, ParseIntPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { decodificar } from '../empalme/csv';
import { VariacionesService } from './variaciones.service';

// Un año completo de Data pesa ~85 MB.
const LIMITE_ARCHIVO = 200 * 1024 * 1024;

@ApiTags('Variaciones')
@Controller('variaciones')
export class VariacionesController {
  constructor(private readonly service: VariacionesService) {}

  @Post('historico')
  @Roles('administrador', 'editor')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: LIMITE_ARCHIVO } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Cargar el histórico de transacciones de Data (varios meses). No liquida ni crea cobros.' })
  historico(@UploadedFile() archivo: { buffer: Buffer } | undefined, @CurrentUser() usuario: string) {
    if (!archivo?.buffer?.length) throw new BadRequestException('Adjunte el archivo CSV en el campo "archivo".');
    return this.service.cargarHistorico(decodificar(archivo.buffer), usuario);
  }

  @Get('periodos')
  @ApiOperation({ summary: 'Meses con volumen diario cargado y hasta qué día' })
  periodos() {
    return this.service.periodos();
  }

  @Get('analisis')
  @ApiOperation({ summary: 'Eventos generales y variaciones del último mes cargado' })
  analisis() {
    return this.service.analizarUltimo();
  }

  @Get('clientes/:id')
  @ApiQuery({ name: 'servicio', required: false, description: 'Vacío = todos los servicios sumados' })
  @ApiOperation({ summary: 'Serie diaria y mensual del cliente, con lo esperado y los días marcados' })
  serieCliente(@Param('id', ParseIntPipe) id: number, @Query('servicio') servicio?: string) {
    return this.service.serieCliente(id, servicio || undefined);
  }
}
