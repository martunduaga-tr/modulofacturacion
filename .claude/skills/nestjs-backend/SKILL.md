---
name: nestjs-backend
description: Construye el backend NestJS + SQL Server del sistema de facturación de Transfiriendo. Úsala SIEMPRE que crees o modifiques módulos, controladores, servicios, entidades, DTOs, migraciones de base de datos, endpoints REST, o la capa de persistencia. Cubre las convenciones del proyecto (estructura de módulos, validación, auditoría, conexión a SQL Server on-premise). Si el usuario pide "el backend", "la API", "un endpoint", "el DDL", "las entidades", "un módulo de", esta skill aplica.
---

# Backend NestJS — Sistema de facturación Transfiriendo

Construye la API. Consulta `facturacion-domain` para el modelo de datos y las reglas de negocio antes de crear entidades o endpoints — no inventes reglas aquí.

## Stack

- NestJS 10 + TypeScript.
- SQL Server **on-premise** (corporativo). Conexión vía `mssql` / TypeORM o Drizzle (alinear a lo que el equipo ya use; por defecto TypeORM por madurez con SQL Server).
- Validación con `class-validator` + `class-transformer` en DTOs.
- API REST documentada con Swagger (`@nestjs/swagger`).
- Autenticación por roles (JWT + guards). Integrable luego con el directorio corporativo.

## Estructura de módulos (Etapa 1)

Un módulo por agregado del dominio:

```
src/
  productos/         # productos + conceptos facturables
  clientes/
  contratos/         # contratos + contrato_items
  tarifas/           # escalones, mínimo, fijo
  parametros/        # parámetros globales tributarios
  auditoria/         # registro de cambios
  auth/              # roles y guards
  common/            # filtros, interceptores, utilidades de moneda/fecha
```

Cada módulo: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `entities/`, `dto/`.

## Convenciones

- **DTOs siempre validados.** Toda entrada pasa por un DTO con `class-validator`. Nunca confíes en el body crudo.
- **Reglas de negocio en servicios, no en controladores.** El controlador orquesta; el servicio decide. La validación de solapamiento de escalones, mínimos coherentes, etc., vive en el servicio de `tarifas`.
- **Auditoría transversal.** Toda escritura en tarifas/contratos/parámetros registra en `auditoria_cambios` (usuario, acción, valor anterior/nuevo). Implementar con un interceptor o un servicio de auditoría inyectado, no a mano en cada endpoint.
- **Transacciones** para operaciones que tocan varias tablas (crear contrato con items y escalones es atómico: o todo o nada).
- **Respuestas consistentes.** Estructura uniforme de respuesta y de error; errores de validación con mensajes en español accionables (el frontend los muestra tal cual).
- **Moneda y decimales:** usar tipos decimales exactos en SQL Server (`DECIMAL`), nunca float, para montos y tarifas. Los cálculos de la etapa 3 dependen de precisión exacta.

## Endpoints clave (Etapa 1)

```
# Productos / conceptos
GET    /productos
POST   /productos
GET    /productos/:id/conceptos
POST   /productos/:id/conceptos

# Clientes
GET    /clientes?busqueda=&estado=
POST   /clientes
GET    /clientes/:id

# Contratos
GET    /contratos?producto=&modelo=&estado=&busqueda=
POST   /contratos                      # crea contrato + items + tarifas (transacción)
GET    /contratos/:id                  # ficha completa con items y tarifas
PATCH  /contratos/:id

# Tarifas (por item)
GET    /contrato-items/:id/tarifas?anio=
POST   /contrato-items/:id/escalones
PATCH  /escalones/:id
POST   /contrato-items/:id/anio        # agregar precios de un nuevo año (versionado IPC)

# Parámetros
GET    /parametros
PATCH  /parametros/:clave

# Auditoría
GET    /auditoria?tabla=&desde=&hasta=
```

## Validaciones de servicio críticas

Implementar en el servicio de `tarifas` (ver `facturacion-domain` para las reglas):

- Escalones de un mismo item y año: sin solapamiento, sin `desde > hasta`, precio > 0.
- Un item no se persiste sin tarifa coherente con su `modelo_cobro`.
- El concepto de un item debe pertenecer al producto del item.

## Migraciones

- El DDL deriva del modelo en `facturacion-domain/references/modelo-datos.md`.
- Usar migraciones versionadas (no `synchronize: true` en producción).
- Semilla inicial: parámetros tributarios (IVA, retenciones, IPC, TRM) y los ~34 productos con sus conceptos.

## Preparación para etapas siguientes

- La API de tarifas debe ser consumible por el motor de cálculo (etapa 3) sin cambios: exponer "dame la tarifa vigente para cliente+producto+concepto+año+volumen".
- Dejar el módulo `parametros` listo para que el motor lea las tasas tributarias.
