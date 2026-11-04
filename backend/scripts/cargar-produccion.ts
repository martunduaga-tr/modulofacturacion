/**
 * Deja una BD nueva (Railway) con los mismos datos del piloto que la BD local, en una sola ejecución.
 * Re-ejecutable: cada paso es idempotente (los contratos se actualizan por código; los comentarios no
 * pisan lo que ya exista; el usuario solo se crea si no existe).
 *
 * La carpeta (--carpeta) trae los archivos que no se versionan porque tienen datos de clientes:
 *   tabla_contratos_seguros_carga.csv, tabla_contratos_salud_carga.csv, tabla_contratos_factura_carga.csv,
 *   tabla_contratos_ds_nomina_carga.csv,
 *   tabla_contratos_factura_nuevos_carga.csv, tabla_contratos_factura_minimos_carga.csv, tabla_contratos_factura_minimos2_carga.csv,
 *   tabla_contratos_ospedale_carga.csv, tabla_contratos_anuales_carga.csv,
 *   tabla_express_carga.csv (salen de los scripts de Claude outputs/scripts) y comentarios_factura.csv
 *   (de scripts/exportar-comentarios.ts). El piloto de julio va en src/empalme/__fixtures__/tarifario_piloto.csv.
 * La clave temporal del usuario de Contabilidad va en la variable CLAVE_TEMPORAL_JLOPEZ (nunca en el código).
 *
 * Uso (con el .env apuntando a la BD de destino):
 *   CLAVE_TEMPORAL_JLOPEZ=... npx ts-node scripts/cargar-produccion.ts --carpeta ../../tablas_contratos
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { DataSource, IsNull } from 'typeorm';
import { AppModule } from '../src/app.module';
import { decodificar, detectarSeparador, parsearCsv } from '../src/empalme/csv';
import { EmpalmeService } from '../src/empalme/empalme.service';
import { ClientesService } from '../src/clientes/clientes.service';
import { Cliente } from '../src/clientes/entities/cliente.entity';
import { Clasificador, CLASIFICADORES } from '../src/clientes/entities/comentario-factura.entity';
import { ParametrosService } from '../src/parametros/parametros.service';
import { UsuariosService } from '../src/auth/usuarios.service';
import { ContratosService } from '../src/contratos/contratos.service';
import { Contrato } from '../src/contratos/entities/contrato.entity';

const USUARIO = 'carga-inicial';
// Contratos del piloto de julio que Contabilidad reemplazó en sus tablas (30-oct-2026): se cargan y quedan inactivos.
const REEMPLAZADOS = [
  '815000997-FACTURA-2026', // ALMOTORES → 815000997-FACTURA-COE-2026 (mínimo hasta 10.000)
  // Tarifa distinta a la del contrato base del mismo NIT y servicio (30-oct-2026): quedan inactivos para que Contabilidad los active si es la vigente.
  '800185449-FACTURA-COE-2026', '823004940-FACTURA-COE-2026', '823004940-FACTURA-COE-T2-2026',
  '830008686-FACTURA-T2-2026', '830121796-FACTURA-COE-2026', '860019014-FACTURA-T2-2026',
  '860035992-FACTURA-COE-2026', '860037950-FACTURA-COE-2026', '900213617-FACTURA-T2-2026',
];
// En este orden: lo que se carga después actualiza lo anterior con el mismo código de contrato.
const TARIFARIOS = [
  join(__dirname, '../src/empalme/__fixtures__/tarifario_piloto.csv'),
  'tabla_contratos_seguros_carga.csv',
  'tabla_contratos_salud_carga.csv',
  'tabla_contratos_factura_carga.csv',
  'tabla_contratos_factura_nuevos_carga.csv',
  'tabla_contratos_factura_minimos_carga.csv',
  'tabla_contratos_factura_minimos2_carga.csv',
  'tabla_contratos_ospedale_carga.csv',
  'tabla_contratos_ds_nomina_carga.csv',
  'tabla_express_carga.csv',
  'tabla_contratos_anuales_carga.csv',
];

async function main() {
  const i = process.argv.indexOf('--carpeta');
  if (i < 0 || !process.argv[i + 1]) throw new Error('Falta --carpeta');
  const carpeta = process.argv[i + 1];
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    // 1. Contratos
    for (const t of TARIFARIOS) {
      const ruta = t.includes('/') || t.includes('\\') ? t : join(carpeta, t);
      if (!existsSync(ruta)) {
        console.log(`(falta ${ruta}: se omite)`);
        continue;
      }
      const r = await app.get(EmpalmeService).importarTarifario(decodificar(readFileSync(ruta)), USUARIO);
      console.log(`${t.split(/[\\/]/).pop()}: nuevos ${r.contratosCreados} · actualizados ${r.contratosActualizados} · clientes nuevos ${r.clientesCreados}` +
        ` · con retenciones pendientes ${r.esperandoRetenciones} · errores ${r.errores.length}`);
      for (const e of r.errores) console.log(`   ERROR ${e.contratoId}: ${e.mensaje}`);
    }

    const contratos = app.get(ContratosService);
    for (const codigo of REEMPLAZADOS) {
      const c = await app.get(DataSource).getRepository(Contrato).findOne({ where: { codigo } });
      if (c && c.estado !== 'inactivo') await contratos.update(c.id, { estado: 'inactivo' } as never, USUARIO);
      console.log(`Contrato reemplazado ${codigo}: ${c ? 'inactivo' : 'no existe'}`);
    }


    // Grupo Ospedale: bolsa mensual (umbral 263.250) con tramos de exceso y 12 NIT miembros (esquema: db/17_grupos_tarifa.sql).
    const dsGrupo = app.get(DataSource);
    if ((await dsGrupo.query(`SELECT 1 FROM coe.grupos_tarifa WHERE codigo = 'OSPEDALE'`)).length) {
      console.log('Grupo OSPEDALE: ya existe');
    } else {
      await dsGrupo.query(`INSERT INTO coe.grupos_tarifa(codigo,nombre,umbral_mensual) VALUES ('OSPEDALE','Grupo Ospedale: bolsa mensual de Emision',263250)`);
      await dsGrupo.query(`DECLARE @g INT = (SELECT id FROM coe.grupos_tarifa WHERE codigo='OSPEDALE');
        INSERT INTO coe.grupo_tarifa_escalones(grupo_id,anio,volumen_desde,volumen_hasta,precio_unitario) VALUES
          (@g,2026,250001,350000,88.46),(@g,2026,350001,500000,59.31),(@g,2026,500001,700000,48.70),
          (@g,2026,700001,900000,45.95),(@g,2026,900001,999999999,41.84);
        INSERT INTO coe.grupo_tarifa_contratos(grupo_id,contrato_id)
          SELECT @g,id FROM coe.contratos WHERE codigo IN ('900930253-FACTURA-2026','800190884-FACTURA-2026',
            '900848340-FACTURA-2026','830113849-FACTURA-2026','817003166-FACTURA-2026','800094898-FACTURA-2026',
            '891409981-FACTURA-2026','810003245-FACTURA-2026','900612531-FACTURA-2026','900408220-FACTURA-2026',
            '805023423-FACTURA-2026','830512116-FACTURA-2026')`);
      const [{ n }] = await dsGrupo.query(`SELECT COUNT(*) n FROM coe.grupo_tarifa_contratos`);
      console.log(`Grupo OSPEDALE: creado con ${n} contratos miembros`);
    }

    // 2. ReteICA: ningún cliente la practica (Contabilidad, 28-oct-2026)
    const ds = app.get(DataSource);
    const sinIca = await ds.getRepository(Cliente).update({ tasaRteica: IsNull() }, { tasaRteica: 0 });
    await app.get(ParametrosService).upsert('RTEICA', { valor: 0, vigenciaDesde: '2026-01-01' }, USUARIO);
    console.log(`ReteICA: parámetro en 0; clientes completados con 0: ${sinIca.affected ?? 0}`);

    // 3. Comentarios de la línea de factura
    const rutaCom = join(carpeta, 'comentarios_factura.csv');
    if (existsSync(rutaCom)) {
      const texto = decodificar(readFileSync(rutaCom));
      const porNit = new Map((await ds.getRepository(Cliente).find()).map((c) => [c.nit, c.id]));
      const clientes = app.get(ClientesService);
      let cargados = 0, yaTenian = 0, invalidos = 0, clientesCreados = 0;
      for (const f of parsearCsv(texto, detectarSeparador(texto))) {
        if (!f.nit || !(CLASIFICADORES as readonly string[]).includes(f.clasificador)) { invalidos++; continue; }
        let id = porNit.get(f.nit);
        if (!id) {
          // Cliente con facturas pero aún sin contrato en la app: se crea para guardarle el comentario (como en la BD local)
          const nuevo = await ds.getRepository(Cliente).save(ds.getRepository(Cliente).create({ nit: f.nit, razonSocial: f.razon_social || `NIT ${f.nit}`, estado: 'activo', tasaRteica: 0 }));
          id = nuevo.id;
          porNit.set(f.nit, id);
          clientesCreados++;
        }
        const actuales = await clientes.comentariosFactura(id);
        if (actuales.some((c) => c.clasificador === f.clasificador)) { yaTenian++; continue; }
        await clientes.guardarComentarioFactura(id, { clasificador: f.clasificador as Clasificador, comentario: f.comentario }, USUARIO,
          f.origen === 'manual' ? 'manual' : 'historial');
        cargados++;
      }
      console.log(`Comentarios: cargados ${cargados} · ya tenían ${yaTenian} · inválidos ${invalidos} · clientes creados ${clientesCreados}`);
    } else {
      console.log(`(falta ${rutaCom}: comentarios omitidos)`);
    }

    // 4. Usuario de Contabilidad (clave temporal: la cambia al entrar)
    const usuarios = app.get(UsuariosService);
    if (await usuarios.findByUsernameConHash('jlopez')) {
      console.log('Usuario jlopez: ya existe');
    } else if (!process.env.CLAVE_TEMPORAL_JLOPEZ) {
      console.log('Usuario jlopez: NO creado (falta CLAVE_TEMPORAL_JLOPEZ)');
    } else {
      await usuarios.create({ username: 'jlopez', nombre: 'James López', email: 'jlopez@transfiriendo.com', password: process.env.CLAVE_TEMPORAL_JLOPEZ, rol: 'editor' }, USUARIO);
      console.log('Usuario jlopez: creado con clave temporal');
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
