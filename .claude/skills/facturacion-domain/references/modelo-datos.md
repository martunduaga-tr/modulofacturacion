# Modelo de datos — Sistema de facturación

Esquema sobre SQL Server. Reemplaza las hojas `CONTRATOS COE` de todos los productos.

## Tablas

```sql
productos
  id (PK)
  codigo            -- IFACTURA, ISEGUROS, IRECAUDO, BIZUIT, FIRMAFACIL...
  nombre
  estado            -- activo / inactivo

conceptos_facturables
  id (PK)
  producto_id (FK)
  codigo            -- EMISION, RECEPCION... (un producto tiene N conceptos)
  nombre
  estado

clientes
  id (PK)
  nit
  razon_social
  correo_contacto
  estado            -- activo / retirado
  observaciones

contratos
  id (PK)
  cliente_id (FK)
  nombre_contrato   -- "Otro Sí No.1 SG-001"
  vigencia_desde
  vigencia_hasta
  estado
  observaciones

contrato_items                 -- TABLA BISAGRA: contrato + producto + concepto
  id (PK)
  contrato_id (FK)
  producto_id (FK)
  concepto_id (FK)
  modelo_cobro      -- ENUM: volumen_escalonado | minimo_garantizado | fijo_mensual | bolsa

tarifa_escalones               -- TABLA CENTRAL de tarifas (también usada por 'bolsa')
  id (PK)
  contrato_item_id (FK)
  volumen_desde
  volumen_hasta
  anio              -- 2017..2026
  precio_unitario   -- 'volumen_escalonado'/'minimo_garantizado': $/unidad. 'bolsa': monto plano de la banda.
  ipc_aplicado      -- metadato

minimo_garantizado
  id (PK)
  contrato_item_id (FK)
  anio
  valor_minimo
  volumen_tope      -- tope de la banda que cubre valor_minimo (franquicia, ver facturacion-domain SKILL.md)

tarifa_fija
  id (PK)
  contrato_item_id (FK)
  anio
  valor_fijo

recargo_fijo                   -- cargo adicional aditivo, para CUALQUIER modelo_cobro (ej. "MANTENIMIENTO")
  id (PK)
  contrato_item_id (FK)
  anio
  concepto          -- ej. 'MANTENIMIENTO'
  valor             -- se suma siempre al subtotal, sin importar el volumen

parametros_globales
  id (PK)
  clave             -- IVA, RTEFTE, RTEICA, RTEIVA, AUTORRETENCION, IPC, TRM
  valor
  vigencia_desde

auditoria_cambios
  id (PK)
  tabla, registro_id, usuario, accion, valor_anterior, valor_nuevo, fecha
```

## Reglas de integridad

- Un `contrato_item` referencia exactamente un producto y un concepto válidos (el concepto debe pertenecer al producto).
- Las tarifas (escalones / mínimo / fijo) cuelgan del `contrato_item`, NO del contrato.
- Para `volumen_escalonado`: los rangos DE/HASTA de un mismo item y año no se solapan ni dejan huecos; `volumen_desde <= volumen_hasta`; `precio_unitario > 0`.
- Un item no se guarda sin al menos una tarifa válida coherente con su `modelo_cobro`.
- Toda escritura en tarifas/contratos genera un registro en `auditoria_cambios`.

## Una fila de tarifa, leída en lenguaje natural

`tarifa_escalones`: "Para este cliente, producto, concepto y año, los documentos entre `volumen_desde` y `volumen_hasta` se cobran a `precio_unitario` cada uno."

## Pendiente de validación

Antes de cerrar el modelo, revisar 2-3 Excel de otros productos: aunque los modelos de cobro son los mismos, el FORMATO de las hojas puede variar y exigir parsers distintos en la migración. Confirmar también si algún producto tiene más de dos conceptos facturables.
