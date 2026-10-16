import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Volumen } from './entities/volumen.entity';
import { PreLiquidado } from './entities/pre-liquidado.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Producto } from '../productos/entities/producto.entity';
import { ConceptoFacturable } from '../productos/entities/concepto-facturable.entity';
import { ContratoItem } from '../contratos/entities/contrato-item.entity';
import { VolumenesService } from './volumenes.service';
import { VolumenesController } from './volumenes.controller';
import { PreLiquidadoService } from './pre-liquidado.service';
import { PreLiquidadoController } from './pre-liquidado.controller';
import { MotorCalculoService } from './motor-calculo.service';
import { TarifasModule } from '../tarifas/tarifas.module';
import { ParametrosModule } from '../parametros/parametros.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Volumen, PreLiquidado, Cliente, Producto, ConceptoFacturable, ContratoItem]),
    TarifasModule,
    ParametrosModule,
  ],
  controllers: [VolumenesController, PreLiquidadoController],
  providers: [VolumenesService, PreLiquidadoService, MotorCalculoService],
  exports: [MotorCalculoService, VolumenesService, PreLiquidadoService],
})
export class CalculoModule {}
