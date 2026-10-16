import { DataSourceOptions } from 'typeorm';

/**
 * Construye las opciones de conexión a SQL Server desde variables de entorno.
 * Compartido por el módulo de Nest (runtime) y por data-source.ts (CLI de migraciones),
 * para que ambos usen exactamente la misma configuración.
 *
 * synchronize SIEMPRE en false: el esquema es la fuente de verdad en database/*.sql
 * (desplegado con sqlcmd). TypeORM solo mapea las tablas existentes.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  const port = parseInt(process.env.DB_PORT ?? '1433', 10);
  const instanceName = process.env.DB_INSTANCE?.trim() || undefined;

  return {
    type: 'mssql',
    host: process.env.DB_HOST ?? 'localhost',
    port,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    schema: 'coe',
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true',
    entities: [__dirname + '/../**/*.entity.{ts,js}'],
    migrations: [__dirname + '/../migrations/*.{ts,js}'],
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
      instanceName,
    },
  };
}
