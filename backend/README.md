# Backend — Sistema de Facturación COE

API REST (NestJS 10 + TypeORM + SQL Server) para la **Etapa 1**.

## Requisitos

- Node 20+ (probado con 22)
- SQL Server accesible con el esquema `coe` ya creado (ver `../database/`)

## Puesta en marcha

```powershell
cd backend
npm install
copy .env.example .env   # y editar credenciales de SQL Server
# Crear el esquema primero (una vez):
#   sqlcmd -S <servidor> -d <base> -i ..\database\01_schema.sql
#   sqlcmd -S <servidor> -d <base> -i ..\database\02_seed.sql
npm run start:dev
```

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/api/docs`

## Arranque rápido con Docker (entorno de validación)

Para un SQL Server desechable de pruebas (validado el 2026-06-05):

```powershell
# 1. Levantar SQL Server 2022 en contenedor
docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=Coe_Dev_2026*" -e "MSSQL_PID=Developer" `
  -p 1433:1433 -d --name sqlserver-coe mcr.microsoft.com/mssql/server:2022-latest

# 2. Crear base + aplicar esquema y semilla (esperar ~30s a que inicialice)
sqlcmd -S localhost,1433 -U sa -P "Coe_Dev_2026*" -C -Q "IF DB_ID('facturacion_coe') IS NULL CREATE DATABASE facturacion_coe;"
sqlcmd -S localhost,1433 -U sa -P "Coe_Dev_2026*" -C -d facturacion_coe -i ..\database\01_schema.sql
sqlcmd -S localhost,1433 -U sa -P "Coe_Dev_2026*" -C -d facturacion_coe -f 65001 -i ..\database\02_seed.sql

# 3. .env apuntando a localhost:1433 (DB_USER=sa, DB_PASSWORD=Coe_Dev_2026*) y levantar
npm run start:dev
```

Parar / reiniciar: `docker stop sqlserver-coe` · `docker start sqlserver-coe`.
Borrar y empezar de cero: `docker rm -f sqlserver-coe`.

## Arquitectura

- **Esquema = fuente de verdad en `database/*.sql`.** TypeORM va con `synchronize: false`
  y solo mapea las tablas existentes. Las migraciones versionadas de TypeORM
  (`src/migrations/`) se usarán para cambios incrementales futuros.
- Un módulo por agregado del dominio (`src/<modulo>/`): `*.module.ts`,
  `*.controller.ts`, `*.service.ts`, `entities/`, `dto/`.
- Validación global de DTOs con `class-validator` (whitelist + forbidNonWhitelisted).
- Montos/tarifas en `DECIMAL` exacto; el `numericTransformer` los expone como número.

## Estado de los módulos (Etapa 1)

| Módulo | Estado |
|---|---|
| `productos` (productos + conceptos, RF-7) | ✅ implementado |
| Entidades de todos los agregados | ✅ mapeadas |
| `clientes` | pendiente |
| `contratos` (+ items) | pendiente |
| `tarifas` | pendiente |
| `parametros` | pendiente |
| `auditoria` | pendiente |
| `auth` (JWT + roles) | pendiente |

> Los guards de rol se aplicarán a los controladores cuando exista el módulo `auth`.
