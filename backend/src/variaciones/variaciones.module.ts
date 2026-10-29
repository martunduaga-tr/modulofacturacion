import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { Cliente } from '../clientes/entities/cliente.entity';
import { PreLiquidado } from '../calculo/entities/pre-liquidado.entity';
import { VolumenDiario, VolumenDiarioPeriodo } from './entities/volumen-diario.entity';
import { VariacionesController } from './variaciones.controller';
import { VariacionesService } from './variaciones.service';

@Module({
  imports: [TypeOrmModule.forFeature([VolumenDiario, VolumenDiarioPeriodo, Cliente, PreLiquidado]), AuditoriaModule],
  controllers: [VariacionesController],
  providers: [VariacionesService],
  exports: [VariacionesService],
})
export class VariacionesModule {}
