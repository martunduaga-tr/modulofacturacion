import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contrato } from '../contratos/entities/contrato.entity';
import { ConceptoFacturable } from '../productos/entities/concepto-facturable.entity';
import { CalculoModule } from '../calculo/calculo.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { SolicitudExpress } from './entities/solicitud-express.entity';
import { CobroExpress } from './entities/cobro-express.entity';
import { ConsumoExpress } from './entities/consumo-express.entity';
import { ExpressService } from './express.service';
import { ExpressController } from './express.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SolicitudExpress, CobroExpress, ConsumoExpress, Contrato, ConceptoFacturable]),
    CalculoModule,
    AuditoriaModule,
  ],
  controllers: [ExpressController],
  providers: [ExpressService],
})
export class ExpressModule {}
