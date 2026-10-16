import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { ReconciliacionService } from './reconciliacion.service';
import { ReconciliacionController } from './reconciliacion.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [TypeOrmModule.forFeature([Cliente, Contrato]), AuditoriaModule],
  controllers: [ReconciliacionController],
  providers: [ReconciliacionService],
})
export class ReconciliacionModule {}
