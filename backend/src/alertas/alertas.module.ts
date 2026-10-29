import { AlertaRevision } from './entities/alerta-revision.entity';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { VariacionesModule } from '../variaciones/variaciones.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { ContratoItem } from '../contratos/entities/contrato-item.entity';
import { Volumen } from '../calculo/entities/volumen.entity';
import { AlertasService } from './alertas.service';
import { AlertasController } from './alertas.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Cliente, Contrato, ContratoItem, Volumen, AlertaRevision]), VariacionesModule, AuditoriaModule],
  controllers: [AlertasController],
  providers: [AlertasService],
})
export class AlertasModule {}
