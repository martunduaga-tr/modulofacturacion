import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Producto } from './entities/producto.entity';
import { ConceptoFacturable } from './entities/concepto-facturable.entity';
import { ProductosService } from './productos.service';
import { ProductosController } from './productos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Producto, ConceptoFacturable])],
  controllers: [ProductosController],
  providers: [ProductosService],
  exports: [ProductosService],
})
export class ProductosModule {}
