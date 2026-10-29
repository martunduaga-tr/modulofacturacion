import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ArchivoPdf, ExpressService } from './express.service';
import { RevisionDto, SolicitudExpressDto } from './dto/solicitud-express.dto';

const PDF = FileInterceptor('adjunto', { limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * Clientes Express: Comercial crea solicitudes (cliente nuevo, renovación,
 * cobro de adicionales) y Contabilidad las aprueba, devuelve para corrección
 * o rechaza. Sin aprobación no hay cobro.
 */
@ApiTags('Express')
@Controller('express')
export class ExpressController {
  constructor(private readonly service: ExpressService) {}

  @Get('suscripciones')
  @ApiOperation({ summary: 'Suscripciones Express activas: plan, vigencia, días para vencer y consumo frente al tope' })
  suscripciones() {
    return this.service.suscripciones();
  }

  @Get('solicitudes')
  @ApiOperation({ summary: 'Solicitudes de Comercial (filtrable por estado)' })
  listar(@Query('estado') estado?: string) {
    return this.service.listar(estado);
  }

  @Get('solicitudes/:id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtener(id);
  }

  @Get('solicitudes/:id/adjunto')
  @ApiOperation({ summary: 'Descargar el PDF de soporte' })
  async adjunto(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { nombre, contenido } = await this.service.adjunto(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(nombre)}"`);
    res.send(contenido);
  }

  @Post('solicitudes')
  @Roles('comercial', 'administrador')
  @UseInterceptors(PDF)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Comercial crea una solicitud (PDF en el campo "adjunto")' })
  crear(@Body() dto: SolicitudExpressDto, @UploadedFile() adjunto: ArchivoPdf | undefined, @CurrentUser() usuario: string) {
    return this.service.crear(dto, adjunto, usuario);
  }

  @Patch('solicitudes/:id')
  @Roles('comercial', 'administrador')
  @UseInterceptors(PDF)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Comercial corrige y reenvía una solicitud devuelta' })
  corregir(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SolicitudExpressDto,
    @UploadedFile() adjunto: ArchivoPdf | undefined,
    @CurrentUser() usuario: string,
  ) {
    return this.service.corregir(id, dto, adjunto, usuario);
  }

  @Patch('solicitudes/:id/aprobar')
  @Roles('editor', 'administrador')
  @ApiOperation({ summary: 'Contabilidad aprueba: aplica el plan y genera los cobros' })
  aprobar(@Param('id', ParseIntPipe) id: number, @CurrentUser() usuario: string) {
    return this.service.aprobar(id, usuario);
  }

  @Patch('solicitudes/:id/correccion')
  @Roles('editor', 'administrador')
  @ApiOperation({ summary: 'Contabilidad devuelve la solicitud a Comercial con un comentario' })
  correccion(@Param('id', ParseIntPipe) id: number, @Body() dto: RevisionDto, @CurrentUser() usuario: string) {
    return this.service.pedirCorreccion(id, dto.comentario, usuario);
  }

  @Patch('solicitudes/:id/rechazar')
  @Roles('editor', 'administrador')
  @ApiOperation({ summary: 'Contabilidad rechaza la solicitud' })
  rechazar(@Param('id', ParseIntPipe) id: number, @Body() dto: RevisionDto, @CurrentUser() usuario: string) {
    return this.service.rechazar(id, dto.comentario, usuario);
  }

  @Get('cobros')
  @ApiOperation({ summary: 'Cobros Express generados por solicitudes aprobadas' })
  cobros(@Query('estado') estado?: string) {
    return this.service.listarCobros(estado);
  }
}
