/**
 * Exporta los comentarios de la línea de factura (por cliente y clasificador) de esta BD a un CSV
 * que lee cargar-produccion.ts. Sirve para pasar a otra BD lo que Contabilidad ya revisó o editó.
 *
 * Uso:
 *   npx ts-node scripts/exportar-comentarios.ts --archivo ../../tablas_contratos/comentarios_factura.csv
 */
import { writeFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

/** Marca UTF-8 al inicio del archivo: Excel en español la usa para leer bien las tildes. */
const BOM = String.fromCharCode(0xfeff);

const celda = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

async function main() {
  const i = process.argv.indexOf('--archivo');
  if (i < 0 || !process.argv[i + 1]) throw new Error('Falta --archivo');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const filas: { nit: string; razon_social: string; clasificador: string; comentario: string; origen: string }[] = await app.get(DataSource).query(
      `SELECT cl.nit, cl.razon_social, c.clasificador, c.comentario, c.origen
       FROM coe.cliente_comentarios_factura c JOIN coe.clientes cl ON cl.id = c.cliente_id ORDER BY cl.nit, c.clasificador`,
    );
    const lineas = ['nit;razon_social;clasificador;comentario;origen',
      ...filas.map((f) => [f.nit, f.razon_social ?? '', f.clasificador, f.comentario, f.origen].map(celda).join(';'))];
    writeFileSync(process.argv[i + 1], BOM + lineas.join('\r\n') + '\r\n', 'utf8');
    console.log(`Comentarios exportados: ${filas.length}`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
