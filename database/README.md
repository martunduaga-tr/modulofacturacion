# Base de datos — Sistema de Facturación COE

Esquema SQL Server (on-premise) para la **Etapa 1: gestión de contratos y tarifas**.
Reemplaza las hojas `CONTRATOS COE` del Excel.

## Archivos

| Archivo | Qué hace |
|---|---|
| `01_schema.sql` | Crea el esquema `coe` y las 11 tablas con sus llaves, índices y validaciones (CHECK / UNIQUE / FK). |
| `02_seed.sql` | Carga de catálogo mínima: parámetros tributarios + producto iFactura y sus conceptos. Idempotente. |

## Cómo aplicarlo

Sobre una base de datos ya creada, ejecutar en orden con `sqlcmd` (o desde SSMS):

```powershell
sqlcmd -S <servidor> -d <base> -i database\01_schema.sql
# IMPORTANTE: -f 65001 (codepage UTF-8) para que los acentos (Emisión, Recepción,
# Retención…) se guarden bien. Sin esto, sqlcmd los corrompe (mojibake).
sqlcmd -S <servidor> -d <base> -f 65001 -i database\02_seed.sql
```

> El backend NestJS (siguiente paso) usará migraciones versionadas. Este DDL es la
> referencia revisable del modelo; al armar el backend se traduce a migraciones.

## Modelo de datos

Jerarquía central:

```
PRODUCTO (iFactura, iSeguros, … ~34)
   └── CONCEPTO FACTURABLE (emisión, recepción…)
          └── CONTRATO_ITEM (contrato + producto + concepto)
                 └── TARIFA (escalonado / mínimo / fijo), versionada por AÑO
```

Las **tarifas cuelgan del `contrato_item`**, no del contrato. Un cliente puede tener,
bajo un mismo contrato, iFactura-emisión escalonado, iFactura-recepción con mínimo e
iSeguros fijo, todo manejado de forma uniforme.

### Tablas

| Tabla | Rol |
|---|---|
| `productos` | Los ~34 productos del portafolio. |
| `conceptos_facturables` | Conceptos por producto (N por producto). |
| `clientes` | Las ~700 empresas (por NIT). |
| `contratos` | Acuerdo con un cliente. |
| `contrato_items` | Bisagra contrato+producto+concepto; fija el `modelo_cobro`. |
| `tarifa_escalones` | Tabla central: escalones DE/HASTA con precio por año. |
| `minimo_garantizado` | Piso por año para el modelo de mínimo. |
| `tarifa_fija` | Monto fijo por año para el modelo fijo. |
| `parametros_globales` | Tasas tributarias e IPC/TRM, versionadas por vigencia. |
| `usuarios` | Auth por roles (administrador/editor/lector). |
| `auditoria_cambios` | Registro de toda escritura en tarifas/contratos/parámetros. |

## Decisiones de diseño reflejadas en el DDL

- **Precio efectivo por año se almacena** (no se recalcula desde IPC) → auditabilidad.
- **Escalonado NO es por tramos**: el escalón selecciona la tarifa; el motor (etapa 3)
  multiplica todo el volumen por ella. El DDL solo guarda los escalones.
- **Integridad concepto↔producto** garantizada por FK compuesta
  (`contrato_items.concepto_id, producto_id` → `conceptos_facturables.id, producto_id`).
- **DECIMAL exacto** para montos/tarifas (nunca FLOAT); **BIGINT** para volúmenes.
- **No-solapamiento de escalones** se valida en el servicio del backend
  (no es expresable como CHECK de fila); el DDL evita duplicar el punto de inicio.

## Pendiente / a confirmar con Contabilidad

- Lista real de los otros ~33 productos y sus conceptos (RF-7).
- Base exacta de cada retención (RteFte 3,5% vs 4%, base de RteICA/RteIVA).
- Si algún producto tiene más de dos conceptos facturables.
- Valor de arranque de la TRM (sembrado en 0).
