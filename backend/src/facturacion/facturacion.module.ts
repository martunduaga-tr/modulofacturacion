import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LineaFacturacion } from './entities/linea-facturacion.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { ContratoItem } from '../contratos/entities/contrato-item.entity';
import { FacturacionService } from './facturacion.service';
import { FacturacionController } from './facturacion.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [TypeOrmModule.forFeature([LineaFacturacion, Cliente, ContratoItem]), AuditoriaModule],
  controllers: [FacturacionController],
  providers: [FacturacionService],
  exports: [FacturacionService],
})
export class FacturacionModule {}
