import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { EmpalmeService } from './empalme.service';
import { periodoAnterior } from './bigquery-volumenes.service';

/**
 * Liquidación automática del mes cerrado anterior, consultando BigQuery.
 * Solo se activa con EMPALME_AUTOMATICO=true y BigQuery configurado: nada
 * corre por sorpresa. El resultado queda en 'calculado' — la aprobación sigue
 * siendo humana.
 *
 *   EMPALME_CRON  expresión cron (default: día 3 a las 6:00, hora Colombia),
 *                 para dar margen a que Data cierre el mes.
 */
@Injectable()
export class EmpalmeProgramadoService implements OnModuleInit {
  private readonly log = new Logger('EmpalmeProgramado');

  constructor(
    private readonly empalme: EmpalmeService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onModuleInit() {
    if (process.env.EMPALME_AUTOMATICO !== 'true') {
      this.log.log('Liquidación automática desactivada (EMPALME_AUTOMATICO != true).');
      return;
    }
    if (!this.empalme.estadoBigQuery().configurado) {
      this.log.warn('EMPALME_AUTOMATICO=true pero BigQuery no está configurado: no se programa nada.');
      return;
    }
    const expresion = process.env.EMPALME_CRON || '0 6 3 * *';
    const job = new CronJob(expresion, () => this.ejecutar(), null, false, 'America/Bogota');
    this.scheduler.addCronJob('empalme-mensual', job);
    job.start();
    this.log.log(`Liquidación automática programada: "${expresion}" (America/Bogota).`);
  }

  async ejecutar(hoy = new Date()): Promise<void> {
    const periodo = periodoAnterior(hoy);
    try {
      const r = await this.empalme.liquidarBigQuery(periodo, 'sistema (programado)', 'bigquery_programado');
      this.log.log(`Periodo ${periodo}: ${r.liquidados} cobros calculados, ${r.bloqueados} ya aprobados, pendientes ${JSON.stringify(r.pendientes)}.`);
    } catch (e) {
      // No se reintenta solo: un cobro mal calculado es peor que uno tardío. Se ve en logs y se corre con el botón.
      this.log.error(`Periodo ${periodo}: la liquidación automática falló — ${(e as Error).message}`);
    }
  }
}
