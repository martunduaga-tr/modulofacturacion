import { BadRequestException, Body, Controller, Get, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { decodificar } from './csv';
import { EmpalmeService } from './empalme.service';
import { LiquidarPeriodoDto } from './dto/liquidar-periodo.dto';
import { ListPendientesQueryDto } from './dto/list-pendientes-query.dto';

/** Archivo recibido por multer (memoria). Tipado local: el proyecto no usa @types/multer. */
interface ArchivoSubido {
  buffer: Buffer;
  originalname: string;
  size: number;
}

// El export de BigQuery de un mes pesa ~10 MB; un año completo ~120 MB.
const LIMITE_ARCHIVO = 200 * 1024 * 1024;

function texto(archivo: ArchivoSubido | undefined): string {
  if (!archivo?.buffer?.length) throw new BadRequestException('Adjunte el archivo CSV en el campo "archivo".');
  return decodificar(archivo.buffer);
}

const CUERPO_ARCHIVO = {
  schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } } },
};

@ApiTags('Empalme Data ↔ Contabilidad')
@Controller('empalme')
export class EmpalmeController {
  constructor(private readonly service: EmpalmeService) {}

  @Post('tarifario')
  @Roles('administrador', 'editor')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: LIMITE_ARCHIVO } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody(CUERPO_ARCHIVO)
  @ApiOperation({ summary: 'Importar el tarifario de Contabilidad (CSV con separador ;)' })
  importarTarifario(@UploadedFile() archivo: ArchivoSubido, @CurrentUser() usuario: string) {
    return this.service.importarTarifario(texto(archivo), usuario);
  }

  @Post('liquidar')
  @Roles('administrador', 'editor')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: LIMITE_ARCHIVO } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { periodo: { type: 'string', example: '2026-07' }, archivo: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Empalmar el export de BigQuery del periodo con los contratos y generar los pre-liquidados' })
  liquidar(@Body() dto: LiquidarPeriodoDto, @UploadedFile() archivo: ArchivoSubido, @CurrentUser() usuario: string) {
    return this.service.liquidarCsv(dto.periodo, texto(archivo), usuario, { excluirHrsDev: dto.excluirHrsDev });
  }

  @Post('liquidar-bigquery')
  @Roles('administrador', 'editor')
  @ApiOperation({ summary: 'Empalmar consultando BigQuery directamente (sin descargar el CSV)' })
  liquidarBigQuery(@Body() dto: LiquidarPeriodoDto, @CurrentUser() usuario: string) {
    return this.service.liquidarBigQuery(dto.periodo, usuario, 'bigquery', { excluirHrsDev: dto.excluirHrsDev });
  }

  @Get('bigquery/estado')
  @ApiOperation({ summary: '¿Está configurada la consulta directa a BigQuery?' })
  estadoBigQuery() {
    return this.service.estadoBigQuery();
  }

  @Get('pendientes')
  @ApiOperation({ summary: 'Volumen del periodo que no empalmó, con su motivo' })
  pendientes(@Query() q: ListPendientesQueryDto) {
    return this.service.pendientes(q.anio, q.mes);
  }
}
