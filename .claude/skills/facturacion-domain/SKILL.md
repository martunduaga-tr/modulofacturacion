---
name: facturacion-domain
description: Conocimiento del dominio de facturación de Transfiriendo S.A. Úsala SIEMPRE que trabajes en cualquier parte del sistema de facturación automatizada (COE) — modelos de cobro, tarifas, contratos, productos del portafolio, cálculo de facturas, cascada tributaria colombiana, o el modelo de datos. Consúltala antes de escribir DDL, endpoints, formularios de tarifas, o el motor de cálculo, para no inventar reglas de negocio. Si el usuario menciona iFactura, contratos COE, escalones, mínimo garantizado, IVA/retenciones, o pre-liquidado, esta skill aplica.
---

# Dominio de facturación — Transfiriendo S.A.

Este es el conocimiento de negocio compartido del sistema de facturación automatizada. Cualquier agente (frontend, backend, migración, motor de cálculo) debe alinearse a estas reglas. Si una decisión técnica contradice algo de aquí, el dominio gana.

## Qué resuelve el sistema

Contabilidad factura mensualmente a ~700 empresas por ~34 productos del portafolio (iFactura, iSeguros, iRecaudo, Bizuit, FirmaFacil, etc.). Hoy todo vive en múltiples archivos Excel que mezclan tarifas, volúmenes, cálculo e impuestos. El sistema reemplaza eso por capas de software con aprobación humana antes de emitir.

El proyecto se entrega en 4 etapas incrementales:
1. **Gestión de contratos y tarifas** (CRUD) — quick win, etapa actual.
2. Digitalización de la matriz de facturación (cabecera de factura).
3. Ingesta de volúmenes + motor de cálculo.
4. Generación automática de facturas (iFactura API + SIIGO).

## Jerarquía conceptual (CRÍTICA)

```
PRODUCTO (iFactura, iSeguros, … ~34)
   └── CONCEPTO FACTURABLE (ej. en iFactura: emisión, recepción)
          └── CONTRATO_ITEM (cliente + producto + concepto)
                 └── TARIFA (escalonado / mínimo / fijo), versionada por AÑO
```

No modeles "emisión vs recepción" como caso especial: son dos conceptos del producto iFactura. Un cliente puede tener varios items con modelos de cobro distintos bajo un mismo contrato.

## Los 4 modelos de cobro

Son los mismos para los ~34 productos. El motor no cambia según el producto, solo la tabla de tarifa. (Confirmados con Contabilidad el 2026-08-31 — ver `CASOS_BORDE_MODELO_FACTURACION.md` en la raíz del repo para el detalle caso por caso.)

### 1. Volumen escalonado (el más común)
Tabla de escalones DE/HASTA con una tarifa unitaria por escalón y por año.

**REGLA NO OBVIA, validada contra datos reales:** el cálculo NO es por tramos acumulados. El escalón solo *selecciona* qué tarifa aplica según el volumen total del mes; luego TODO el volumen se multiplica por esa única tarifa.

```
volumen = volumen_mensual_del_cliente
tarifa  = escalón donde (volumen_desde <= volumen <= volumen_hasta), para el año vigente
subtotal = volumen * tarifa          # NO es suma de tramos
```

Verificación: AXA (NIT 860002184) → 243.936 × $50.904 = $12.417.318 = subtotal exacto.

### 2. Mínimo garantizado — es una FRANQUICIA, no un piso `max()`
El mínimo garantizado cubre siempre las primeras `volumen_tope` unidades por un monto plano. El **excedente** sobre ese tope se cobra a la tarifa marginal del escalón donde cae el **volumen total** del mes (no una tarifa propia del tramo del excedente).

```
si volumen <= volumen_tope:
    subtotal = valor_minimo
si no:
    excedente     = volumen - volumen_tope
    tarifa_margen = escalón donde cae el volumen TOTAL (no el del excedente)
    subtotal      = valor_minimo + excedente * tarifa_margen
```

Verificación: ALKA MOTOR, banda mínima 1-1.000 @ $251.359, 3.500 transacciones → escalón del volumen total (3.001-5.000) @ $203,65 → $251.359 + (3.500-1.000)×$203,65 = **$760.484**.

### 3. Bolsa — 4° modelo: paquete plano por banda
Se paga el monto **plano** de la banda en la que cae el volumen total del mes — sin multiplicar por unidades, sin prorrateo. Reutiliza la misma tabla desde/hasta/precio que volumen_escalonado; solo cambia cómo se interpreta el precio.

```
subtotal = precio_de_la_banda donde cae el volumen total   # NO se multiplica por volumen
```

Verificación: FUNDACION SALUD MIA EPS, banda 7.501-8.000 → 7.800 y 7.900 transacciones cobran exactamente **$1.312.108,57** (idéntico); a partir de 8.001 cambia a $1.336.027,21.

### 4. Fijo mensual
Monto fijo independiente del volumen, versionado por año.

```
subtotal = valor_fijo_del_año
```

## Recargo fijo (aditivo, no es un modelo de cobro)

Un item puede tener, además de su modelo de cobro, uno o más cargos fijos mensuales que se suman **siempre** al subtotal, sin importar el volumen (ej. "MANTENIMIENTO" de SAN CARLOS). Aplica sobre cualquiera de los 4 modelos.

```
subtotal_final = subtotal_del_modelo + suma(recargos_fijos_del_item_y_año)
```

Verificación: SAN CARLOS = escala normal por volumen + $1.839.270 cada mes, sin importar las transacciones.

## Versionado por año (IPC)

Cada tarifa tiene un precio por año (2017…2026) porque se incrementa anualmente por IPC.

**Decisión de diseño:** almacenar el precio EFECTIVO por año, no recalcularlo desde el IPC. Esto reproduce exactamente lo facturado y mantiene auditabilidad. El IPC se guarda como metadato y, opcionalmente, como ayuda para sugerir el precio del año nuevo (que un humano confirma).

## Cascada tributaria colombiana

Tras obtener el subtotal, se aplica esta cascada. Las tasas son parámetros globales editables (no hardcodear). Las retenciones aplican según los términos de cada cliente.

| Concepto | Tasa típica | Naturaleza |
|---|---|---|
| IVA | 19% | se suma |
| Autorretención | 0,8% | informativa/contable |
| RteFte | 3,5% o 4% | se resta del recaudo |
| RteIVA | 15% | se resta |
| RteICA | 0,966% | se resta |

El `total` incluye IVA. El `valor cartera` es el neto tras retenciones. Ver `references/calculo-tributario.md` para el orden exacto y un ejemplo numérico.

## Principios rectores (no negociables)

- **El cálculo de facturas es determinístico, nunca lo hace un LLM.** La IA solo asiste la revisión (detección de anomalías) y la migración.
- **Aprobación humana obligatoria** antes de emitir cualquier factura.
- **Trazabilidad fiscal completa:** cada monto guarda su desglose (qué volumen, qué escalón, qué tarifa, qué año, qué impuestos).
- **Idempotencia** en la emisión: nunca doble-facturar ante reintentos.

## Glosario

- **COE:** nombre interno del proceso/hoja de contratos.
- **Pre-liquidado:** factura calculada pero no emitida, pendiente de aprobación.
- **CUFE:** código único de factura electrónica (respuesta DIAN).
- **DIAN:** autoridad tributaria colombiana.
- **SIIGO:** software contable donde se contabiliza.
- **iFactura:** producto de facturación electrónica de Transfiriendo.

## Referencias

- `references/modelo-datos.md` — esquema completo de tablas y relaciones.
- `references/calculo-tributario.md` — orden de la cascada y ejemplo numérico.
