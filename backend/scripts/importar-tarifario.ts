/**
 * Importa un tarifario CSV a la BD con el mismo servicio que usa la pantalla de
 * Empalme (EmpalmeService.importarTarifario): idempotente, un contrato por transacción.
 *
 * Uso:
 *   npx ts-node scripts/importar-tarifario.ts --archivo ../../tablas_contratos/tabla_contratos_seguros_carga.csv
 */
import { readFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { decodificar } from '../src/empalme/csv';
import { EmpalmeService } from '../src/empalme/empalme.service';

async function main() {
  const i = process.argv.indexOf('--archivo');
  if (i < 0 || !process.argv[i + 1]) throw new Error('Falta --archivo');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const r = await app.get(EmpalmeService).importarTarifario(decodificar(readFileSync(process.argv[i + 1])), 'carga-inicial');
    console.log(`Contratos nuevos: ${r.contratosCreados} · actualizados: ${r.contratosActualizados} · clientes nuevos: ${r.clientesCreados}`);
    console.log(`Contratos con retenciones pendientes (no se liquidan hasta completarlas): ${r.esperandoRetenciones}`);
    console.log(`Servicios no medidos por Data (se cobran a mano): ${r.serviciosNoMedidos.join(', ') || '—'}`);
    for (const e of r.errores) console.log(`  ERROR fila ${e.fila || '—'} ${e.contratoId}: ${e.mensaje}`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
