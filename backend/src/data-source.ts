import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './config/database.config';

// Cargado solo por el CLI de TypeORM (migraciones futuras). El runtime de Nest
// usa @nestjs/config. Aquí leemos .env directamente porque el CLI no levanta Nest.
dotenv.config();

export default new DataSource(buildDataSourceOptions());
