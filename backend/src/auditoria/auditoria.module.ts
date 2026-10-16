import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaCambio } from './entities/auditoria-cambio.entity';
import { AuditoriaService } from './auditoria.service';
import { AuditoriaController } from './auditoria.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AuditoriaCambio])],
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
