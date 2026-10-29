import { ParametrosModule } from '../parametros/parametros.module';
import { VariacionesModule } from '../variaciones/variaciones.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contrato } from '../contratos/entities/contrato.entity';
import { ConceptoFacturable } from '../productos/entities/concepto-facturable.entity';
import { CalculoModule } from '../calculo/calculo.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { EmpalmePendiente } from './entities/empalme-pendiente.entity';
import { EmpalmeService } from './empalme.service';
import { EmpalmeController } from './empalme.controller';
import { BIGQUERY_CLIENTE, BigQueryVolumenesService, crearClienteBigQuery } from './bigquery-volumenes.service';
import { EmpalmeProgramadoService } from './empalme-programado.service';

@Module({
  imports: [TypeOrmModule.forFeature([Contrato, ConceptoFacturable, EmpalmePendiente]), CalculoModule, AuditoriaModule, VariacionesModule, ParametrosModule],
  controllers: [EmpalmeController],
  providers: [
    EmpalmeService,
    BigQueryVolumenesService,
    EmpalmeProgramadoService,
    { provide: BIGQUERY_CLIENTE, useFactory: crearClienteBigQuery },
  ],
})
export class EmpalmeModule {}
