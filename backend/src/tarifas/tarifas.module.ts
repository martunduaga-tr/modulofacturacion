import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContratoItem } from '../contratos/entities/contrato-item.entity';
import { TarifaEscalon } from './entities/tarifa-escalon.entity';
import { MinimoGarantizado } from './entities/minimo-garantizado.entity';
import { TarifaFija } from './entities/tarifa-fija.entity';
import { RecargoFijo } from './entities/recargo-fijo.entity';
import { TarifasService } from './tarifas.service';
import { TarifasValidationService } from './tarifas-validation.service';
import { TarifasController } from './tarifas.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContratoItem, TarifaEscalon, MinimoGarantizado, TarifaFija, RecargoFijo]),
    AuditoriaModule,
  ],
  controllers: [TarifasController],
  providers: [TarifasService, TarifasValidationService],
  exports: [TarifasService, TarifasValidationService],
})
export class TarifasModule {}
