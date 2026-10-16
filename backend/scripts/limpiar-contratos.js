/*
 * Script de mantenimiento puntual: borra todos los contratos y clientes
 * cargados (para recargarlos limpio). NO es parte del arranque normal —
 * se ejecuta una sola vez cambiando el startCommand temporalmente.
 *
 * coe.contratos tiene ON DELETE CASCADE hacia contrato_items, y de ahí
 * hacia tarifa_escalones/minimo_garantizado/tarifa_fija/contrato_item_conceptos,
 * así que borrar contratos arrastra todo eso. clientes se borra después.
 */
'use strict';

const sql = require('mssql');

const DB_NAME = process.env.DB_NAME || 'facturacion_coe';

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

async function main() {
  if (!process.env.DB_PASSWORD) {
    throw new Error('[limpiar-contratos] Falta DB_PASSWORD en el entorno.');
  }

  const pool = await new sql.ConnectionPool(baseConfig(DB_NAME)).connect();

  const antesContratos = await pool.request().query('SELECT COUNT(*) AS n FROM coe.contratos');
  const antesClientes = await pool.request().query('SELECT COUNT(*) AS n FROM coe.clientes');
  console.log(
    `[limpiar-contratos] Antes: ${antesContratos.recordset[0].n} contratos, ${antesClientes.recordset[0].n} clientes.`,
  );

  await pool.request().query('DELETE FROM coe.contratos');
  console.log('[limpiar-contratos] coe.contratos borrado (cascada a items/escalones/minimos/tarifa_fija).');

  await pool.request().query('DELETE FROM coe.clientes');
  console.log('[limpiar-contratos] coe.clientes borrado.');

  const despuesContratos = await pool.request().query('SELECT COUNT(*) AS n FROM coe.contratos');
  const despuesClientes = await pool.request().query('SELECT COUNT(*) AS n FROM coe.clientes');
  console.log(
    `[limpiar-contratos] Después: ${despuesContratos.recordset[0].n} contratos, ${despuesClientes.recordset[0].n} clientes.`,
  );

  await pool.close();
  console.log('[limpiar-contratos] Listo.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[limpiar-contratos] FALLÓ:', err.message);
    process.exit(1);
  });
