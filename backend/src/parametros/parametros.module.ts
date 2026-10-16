import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParametroGlobal } from './entities/parametro-global.entity';
import { ParametrosService } from './parametros.service';
import { ParametrosController } from './parametros.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [TypeOrmModule.forFeature([ParametroGlobal]), AuditoriaModule],
  controllers: [ParametrosController],
  providers: [ParametrosService],
  exports: [ParametrosService],
})
export class ParametrosModule {}
