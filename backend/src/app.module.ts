import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './config/database.config';
import { ProductosModule } from './productos/productos.module';
import { ClientesModule } from './clientes/clientes.module';
import { ContratosModule } from './contratos/contratos.module';
import { TarifasModule } from './tarifas/tarifas.module';
import { ParametrosModule } from './parametros/parametros.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { FacturacionModule } from './facturacion/facturacion.module';
import { CalculoModule } from './calculo/calculo.module';
import { ReconciliacionModule } from './reconciliacion/reconciliacion.module';
import { AlertasModule } from './alertas/alertas.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(buildDataSourceOptions()),
    AuthModule,
    ProductosModule,
    ClientesModule,
    ContratosModule,
    TarifasModule,
    ParametrosModule,
    AuditoriaModule,
    FacturacionModule,
    CalculoModule,
    ReconciliacionModule,
    AlertasModule,
  ],
})
export class AppModule {}
