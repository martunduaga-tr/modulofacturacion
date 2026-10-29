import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParametroGlobal } from './entities/parametro-global.entity';
import { TrmDiaria } from './entities/trm-diaria.entity';
import { TrmService } from './trm.service';
import { TrmController } from './trm.controller';
import { ParametrosService } from './parametros.service';
import { ParametrosController } from './parametros.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [TypeOrmModule.forFeature([ParametroGlobal, TrmDiaria]), AuditoriaModule],
  controllers: [ParametrosController, TrmController],
  providers: [ParametrosService, TrmService],
  exports: [ParametrosService, TrmService],
})
export class ParametrosModule {}
