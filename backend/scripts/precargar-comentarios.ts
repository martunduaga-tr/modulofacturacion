/**
 * Precarga el comentario de la línea de factura de cada cliente desde el
 * historial de facturas (plantilla_comentarios_cliente.csv, que sale de
 * Claude outputs/scripts/plantilla_comentarios.py sobre DATA TRANSFIRIENDO 2026).
 *
 * - No pisa un comentario que ya exista (Contabilidad pudo haberlo editado).
 * - Omite las filas marcadas "Parece cobro puntual": no son comentario recurrente.
 * - Si un cliente tuvo varios textos en el año, toma el más reciente (Contabilidad lo ajusta).
 *
 * Uso:
 *   npx ts-node scripts/precargar-comentarios.ts --archivo "../../Claude outputs/plantilla_comentarios_cliente.csv" [--reemplazar-historial] [--crear-clientes]
 */
import { readFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { decodificar, detectarSeparador, parsearCsv } from '../src/empalme/csv';
import { Cliente } from '../src/clientes/entities/cliente.entity';
import { ClientesService } from '../src/clientes/clientes.service';
import { CLASIFICADORES, Clasificador, ComentarioFactura } from '../src/clientes/entities/comentario-factura.entity';

async function main() {
  const i = process.argv.indexOf('--archivo');
  if (i < 0 || !process.argv[i + 1]) throw new Error('Falta --archivo');
  const texto = decodificar(readFileSync(process.argv[i + 1]));
  const filas = parsearCsv(texto, detectarSeparador(texto));

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const ds = app.get(DataSource);
  const clientes = app.get(ClientesService);
  const cuenta = { cargados: 0, yaTenian: 0, sinCliente: new Set<string>(), puntuales: 0, sinComentario: 0, creados: [] as string[] };
  try {
    // --reemplazar-historial: borra (auditado) lo precargado antes; lo que editó Contabilidad (origen manual) no se toca.
    if (process.argv.includes('--reemplazar-historial')) {
      const viejos = await ds.getRepository(ComentarioFactura).find({ where: { origen: 'historial' } });
      for (const v of viejos) await clientes.guardarComentarioFactura(v.clienteId, { clasificador: v.clasificador, comentario: '' }, 'carga-historial', 'historial');
      console.log(`Precargados anteriores borrados: ${viejos.length}`);
    }
    for (const f of filas) {
      const comentario = (f['Comentario sugerido (editable)'] ?? '').trim();
      const clasificador = f['Clasificador'] as Clasificador;
      if (!comentario) { cuenta.sinComentario++; continue; }
      if ((f['Revisar'] ?? '').startsWith('Parece cobro puntual')) { cuenta.puntuales++; continue; }
      if (!CLASIFICADORES.includes(clasificador)) throw new Error(`clasificador desconocido: ${clasificador}`);
      let cliente = await ds.getRepository(Cliente).findOne({ where: { nit: f['NIT'] } });
      // --crear-clientes: el cliente factura hoy pero aún no tiene contrato en la app; se crea para dejarle su comentario.
      if (!cliente && process.argv.includes('--crear-clientes')) {
        const nombre = (f['Cliente'] ?? '').trim();
        cliente = await clientes.create({
          nit: f['NIT'],
          razonSocial: nombre || `NIT ${f['NIT']} (razón social por confirmar)`,
          estado: 'activo',
          observaciones: 'Creado al precargar el comentario de factura desde el historial 2026; aún sin contrato en la app.',
        });
        cuenta.creados.push(`${f['NIT']} ${nombre}`.trim());
      }
      if (!cliente) { cuenta.sinCliente.add(f['NIT']); continue; }
      if (await ds.getRepository(ComentarioFactura).exist({ where: { clienteId: cliente.id, clasificador } })) { cuenta.yaTenian++; continue; }
      await clientes.guardarComentarioFactura(cliente.id, { clasificador, comentario: comentario.slice(0, 500) }, 'carga-historial', 'historial');
      cuenta.cargados++;
    }
  } finally {
    await app.close();
  }
  console.log(`Comentarios precargados: ${cuenta.cargados} · ya tenían comentario: ${cuenta.yaTenian}`);
  console.log(`Omitidos: ${cuenta.sinComentario} sin comentario en el historial · ${cuenta.puntuales} cobros puntuales`);
  console.log(`Clientes creados (${cuenta.creados.length}): ${cuenta.creados.join(' · ') || '—'}`);
  console.log(`NIT sin cliente en la app (${cuenta.sinCliente.size}): ${[...cuenta.sinCliente].join(', ') || '—'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
