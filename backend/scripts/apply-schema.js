/*
 * Aplicador de esquema para el despliegue en Railway.
 *
 * El backend usa synchronize:false — TypeORM NO crea el esquema. En el entorno
 * local eso lo hacía sqlcmd dentro del contenedor. En Railway no hay sqlcmd ni
 * Docker local, así que este script conecta al SQL Server (por la red privada) y
 * aplica los 4 scripts DDL en orden, leyendo los .sql como UTF-8 y enviándolos por
 * TDS (NVARCHAR) — con eso los acentos se preservan sin el codepage -f 65001.
 *
 * Es IDEMPOTENTE: se corre en cada arranque como parte del start command. Los
 * scripts 01-04 (esquema base) se saltan en bloque si coe.productos ya existe.
 * Los scripts posteriores (SCRIPTS_INCREMENTALES) tienen CADA UNO su propio
 * centinela, así que sí se aplican sobre una BD que ya tenía 01-04 — si no,
 * un script nuevo nunca llegaría a una BD existente. Un precio/dato inventado
 * NO puede terminar en una factura, así que ante error real, aborta.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const DB_NAME = process.env.DB_NAME || 'facturacion_coe';

const SCRIPTS = [
  '01_schema.sql',
  '02_seed.sql',
  '03_lineas_facturacion.sql',
  '04_calculo.sql',
];

// Scripts posteriores al centinela de coe.productos: cada uno con su PROPIO
// chequeo de existencia (no todo-o-nada). El centinela de arriba solo cubre
// 01-04; sin esto, un script nuevo nunca se aplicaria sobre una BD que ya
// tiene 01-04 (el chequeo de coe.productos los saltaria a todos).
const SCRIPTS_INCREMENTALES = [
  { archivo: '05_contratos_hibridos.sql', centinela: "OBJECT_ID('coe.contrato_item_conceptos')" },
  { archivo: '06_clientes_dv.sql', centinela: "COL_LENGTH('coe.clientes', 'dv')" },
  { archivo: '07_bolsa_mantenimiento.sql', centinela: "OBJECT_ID('coe.recargo_fijo')" },
];

function baseConfig(database) {
  return {
    server: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD,
    database,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
    },
    pool: { max: 1, min: 0, idleTimeoutMillis: 5000 },
    connectionTimeout: 30000,
    requestTimeout: 120000,
  };
}

// Divide un script T-SQL en lotes por la línea separadora GO (como sqlcmd).
function splitBatches(text) {
  return text
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

async function connectWithRetry(database, { retries = 30, delayMs = 5000 } = {}) {
  for (let intento = 1; intento <= retries; intento++) {
    try {
      const pool = await new sql.ConnectionPool(baseConfig(database)).connect();
      return pool;
    } catch (err) {
      const restante = retries - intento;
      console.log(
        `[apply-schema] SQL Server no responde aún (${database}), intento ${intento}/${retries}: ${err.message}`,
      );
      if (restante === 0) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function aplicarScript(pool, dir, nombre) {
  const ruta = path.join(dir, nombre);
  const texto = fs.readFileSync(ruta, 'utf8');
  const lotes = splitBatches(texto);
  console.log(`[apply-schema] Aplicando ${nombre} (${lotes.length} lotes)…`);
  for (let i = 0; i < lotes.length; i++) {
    try {
      await pool.request().batch(lotes[i]);
    } catch (err) {
      console.error(
        `[apply-schema] ERROR en ${nombre}, lote ${i + 1}/${lotes.length}: ${err.message}`,
      );
      throw err;
    }
  }
  console.log(`[apply-schema] ${nombre} OK.`);
}

async function main() {
  if (!process.env.DB_PASSWORD) {
    throw new Error('[apply-schema] Falta DB_PASSWORD en el entorno.');
  }

  // 1) Conectar a master y crear la BD si no existe.
  console.log('[apply-schema] Conectando a master…');
  let pool = await connectWithRetry('master');
  await pool
    .request()
    .batch(
      `IF DB_ID('${DB_NAME}') IS NULL BEGIN CREATE DATABASE [${DB_NAME}]; END`,
    );
  console.log(`[apply-schema] Base de datos ${DB_NAME} verificada/creada.`);
  await pool.close();

  // 2) Conectar a la BD y comprobar el centinela de idempotencia de 01-04.
  pool = await connectWithRetry(DB_NAME);
  const dir = path.join(__dirname, '..', 'db');
  const centinela = await pool
    .request()
    .query("SELECT OBJECT_ID('coe.productos') AS oid");
  if (centinela.recordset[0].oid) {
    console.log(
      '[apply-schema] El esquema base ya está aplicado (coe.productos existe).',
    );
  } else {
    for (const nombre of SCRIPTS) {
      await aplicarScript(pool, dir, nombre);
    }
    console.log('[apply-schema] Esquema + semilla base aplicados correctamente.');
  }

  // 3) Scripts incrementales posteriores: cada uno con su propio centinela,
  // para que se apliquen sobre una BD que ya tenía 01-04 (ver comentario
  // junto a SCRIPTS_INCREMENTALES).
  for (const { archivo, centinela: expr } of SCRIPTS_INCREMENTALES) {
    const r = await pool.request().query(`SELECT ${expr} AS oid`);
    if (r.recordset[0].oid) {
      console.log(`[apply-schema] ${archivo} ya aplicado.`);
      continue;
    }
    await aplicarScript(pool, dir, archivo);
  }

  await pool.close();
  console.log('[apply-schema] Listo.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[apply-schema] FALLÓ:', err.message);
    process.exit(1);
  });
