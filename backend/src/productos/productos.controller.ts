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
import { ProductosService } from './productos.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { CreateConceptoDto } from './dto/create-concepto.dto';
import { UpdateConceptoDto } from './dto/update-concepto.dto';
import { ListProductosQueryDto } from './dto/list-productos-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Productos y conceptos')
@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos del portafolio (filtrable y paginado)' })
  findAll(@Query() query: ListProductosQueryDto) {
    return this.productosService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver un producto con sus conceptos facturables' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.findOne(id);
  }

  @Post()
  @Roles('administrador')
  @ApiOperation({ summary: 'Dar de alta un producto' })
  create(@Body() dto: CreateProductoDto) {
    return this.productosService.create(dto);
  }

  @Patch(':id')
  @Roles('administrador')
  @ApiOperation({ summary: 'Editar un producto' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductoDto) {
    return this.productosService.update(id, dto);
  }

  @Get(':id/conceptos')
  @ApiOperation({ summary: 'Listar los conceptos facturables de un producto' })
  listConceptos(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.listConceptos(id);
  }

  @Post(':id/conceptos')
  @Roles('administrador')
  @ApiOperation({ summary: 'Agregar un concepto facturable a un producto' })
  createConcepto(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateConceptoDto,
  ) {
    return this.productosService.createConcepto(id, dto);
  }

  @Patch(':id/conceptos/:conceptoId')
  @Roles('administrador')
  @ApiOperation({ summary: 'Editar un concepto facturable' })
  updateConcepto(
    @Param('id', ParseIntPipe) id: number,
    @Param('conceptoId', ParseIntPipe) conceptoId: number,
    @Body() dto: UpdateConceptoDto,
  ) {
    return this.productosService.updateConcepto(id, conceptoId, dto);
  }
}
