---
name: excel-migration
description: Migra los archivos Excel de facturación de Transfiriendo (hojas tipo CONTRATOS COE) a la base de datos SQL Server. Úsala SIEMPRE que el trabajo implique leer, parsear, importar o validar datos desde los Excel de tarifas/contratos hacia el sistema. Genera SIEMPRE un reporte de migración indicando qué se cargó bien y qué requiere revisión manual. Si el usuario menciona "migrar el Excel", "importar contratos", "cargar las tarifas", "parsear la hoja", o pasa un archivo .xlsx de facturación, esta skill aplica.
---

# Migración de Excel de facturación — Transfiriendo

Importa las tarifas desde los Excel a SQL Server. Consulta `facturacion-domain` para el modelo de datos destino y los modelos de cobro antes de mapear nada.

## Contexto

Hay ~34 productos repartidos en **múltiples archivos Excel** (varía: algunos comparten archivo). El archivo de referencia analizado es el de iFactura. La migración se corre **archivo por archivo / producto por producto**, de forma incremental, a medida que se incorpora cada producto.

**No asumas que todos los Excel tienen el mismo formato.** Aunque los modelos de cobro son iguales, la estructura de las hojas puede variar. Revisa cada archivo nuevo antes de migrarlo y adapta el parser.

## Anatomía de la hoja CONTRATOS COE (referencia iFactura)

La hoja organiza la información en **bloques por cliente**, dispuestos en una rejilla (varios clientes por fila de bloques, separados horizontalmente). Cada bloque contiene:

- Nombre del cliente (texto en mayúsculas; cuidado: a veces incluye notas como "cliente retirado", "ESTA YA NO SE USA 28/09/22", "tabla no habilitada").
- Una etiqueta de incremento (IPC) con factores por año.
- Una tabla de escalones: columnas DE / HASTA / VALOR (o PRECIO), con **una columna de precio por año** (2017…2026).
- Opcionalmente una fila MINIMO GARANTIZADO con valor por año.
- Algunos clientes tienen tablas separadas EMISION / RECEPCION → en el modelo destino son dos conceptos del producto.

La hoja también tiene celdas vacías formateadas que inflan el tamaño aparente (ej. 1128 filas pero pocos bloques reales). Detectar bloques por la presencia de nombre + tabla DE/HASTA, no por recorrer todas las filas ciegamente.

## Proceso de migración

1. **Leer** la hoja con pandas/openpyxl (`extract-text` para inspección rápida).
2. **Detectar bloques** de cliente (nombre + tabla de escalones).
3. **Para cada bloque:**
   - Resolver/crear el cliente (por NIT si está, o por nombre).
   - Crear el contrato y el/los `contrato_item` (producto + concepto). El producto se pasa como parámetro de la corrida (un Excel → uno o pocos productos).
   - Determinar el modelo de cobro: si hay MINIMO → `minimo_garantizado`; si solo tabla → `volumen_escalonado`; si valor único fijo → `fijo_mensual`.
   - Cargar los escalones: una fila `tarifa_escalones` por (escalón × año).
   - Cargar mínimo/fijo por año si aplica.
4. **Validar** cada bloque migrado contra las reglas del dominio (solapamientos, precio > 0).
5. **Reportar** (ver abajo).

## Reporte de migración (OBLIGATORIO)

Toda corrida genera un reporte con, como mínimo:

```
Archivo: <nombre>.xlsx   Producto: <CODIGO>
Bloques detectados:      N
Migrados OK:             N1   (lista de clientes)
Requieren revisión:      N2   (cliente + motivo)
  - "CLIENTE X": tabla no habilitada
  - "CLIENTE Y": cliente retirado, omitido
  - "CLIENTE Z": escalones con hueco entre 7000 y 7001
Sin NIT (resueltos por nombre): N3
```

El reporte es tan importante como la carga: nunca asumas que todo migró limpio. Los bloques irregulares se listan para corrección manual, no se fuerzan ni se inventan datos.

## Reglas

- **Idempotencia:** correr la migración dos veces sobre el mismo archivo no debe duplicar datos. Detectar existentes por (NIT/cliente + producto + concepto + contrato).
- **Migración de una vez por archivo:** es semilla de datos, no un proceso recurrente. Tras migrar, la fuente de verdad es la base, no el Excel.
- **Precisión decimal:** cargar precios y mínimos como decimales exactos.
- **Trazar el origen:** registrar de qué archivo y bloque vino cada tarifa (útil para auditoría y para reconciliar contra el Excel original).
- **Verificación post-carga:** tomar 2-3 clientes y confirmar que la tarifa migrada reproduce el valor del Excel (ej. recalcular un subtotal conocido).
