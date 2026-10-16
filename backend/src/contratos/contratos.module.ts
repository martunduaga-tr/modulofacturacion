import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contrato } from './entities/contrato.entity';
import { ContratoItem } from './entities/contrato-item.entity';
import { ContratoItemConcepto } from './entities/contrato-item-concepto.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Producto } from '../productos/entities/producto.entity';
import { ConceptoFacturable } from '../productos/entities/concepto-facturable.entity';
import { ContratosService } from './contratos.service';
import { ContratosController } from './contratos.controller';
import { TarifasModule } from '../tarifas/tarifas.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contrato, ContratoItem, ContratoItemConcepto, Cliente, Producto, ConceptoFacturable]),
    TarifasModule,
    AuditoriaModule,
  ],
  controllers: [ContratosController],
  providers: [ContratosService],
  exports: [ContratosService],
})
export class ContratosModule {}
