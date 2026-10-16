# Avances — Sistema de Facturación Automatizada (COE)

> Corte de información: 2026-09-07.
> Fuentes: `ESTADO_PROYECTO.md`, `CASOS_BORDE_MODELO_FACTURACION.md`, memoria del proyecto (casos borde, despliegue Railway).

---

## Resumen ejecutivo

| Fase | Contenido | Estado |
|---|---|---|
| **Fase 1 — Depuración y fuente de verdad** | Clientes y contratos migrados, validados y depurados (casos borde del modelo de cobro resueltos con Contabilidad) | ✅ **Completa** |
| **Fase 2 — Integración de todos los clientes** | Cargar el 100% de clientes/servicios reales (los que hoy no tienen tarifa, NIT o tarifa 2026 registrada) | 🟡 **Pendiente** |
| **Fase 3 — Emisión automática (iFactura / SIIGO)** | Envío de las facturas aprobadas directamente a los sistemas contables, sin transcripción manual | ⏸️ **Pendiente — bloqueada por confirmación de API** |

---

## Fase 1 — Depuración de clientes y contratos ✅ COMPLETA

### Migración e infraestructura
- **99 contratos / 99 clientes** migrados desde el Excel `CONTRATOS COE` y verificados contra el origen (255 precios contrastados en 4 contratos, 0 diferencias).
- Backend (NestJS + SQL Server) y frontend (React) desplegados en Railway, con Design System institucional de Transfiriendo aplicado (marca, tipografía, sidebar).
- Módulos completos y en producción: Contratos, Clientes, Productos/Tarifas, Parámetros tributarios, Auditoría, Usuarios por rol, Alertas, Reconciliación cliente↔contrato, Pre-liquidado (motor de cálculo + aprobación humana).

### Depuración de vigencia
- **70 clientes activos / 29 retirados** tras revisar quién sigue facturando (regla: sin facturación desde 2023 o antes → retirado; baja lógica, reversible). Contratos propagados igual (70 activos / 29 inactivos de 99).
- Corregido un defecto del cargador que perdía los años más recientes de 6 clientes al toparse con tablas duplicadas en el Excel (se quedaba con la tabla vieja).

### Casos borde del modelo de cobro (`CASOS_BORDE_MODELO_FACTURACION.md`, confirmado con Contabilidad en 2 rondas: 2026-08-31 y 2026-09-04)
Se revisaron los 4 Excel de contratos por unidad de negocio (FACTURA, RECAUDO, SALUD, SEGUROS) y el maestro de clientes. Resultado:

- **✅ Bloque A — "Mínimo garantizado" es una franquicia**, no un simple `máximo(volumen×tarifa, mínimo)`: cubre las primeras N unidades por un monto plano, y el excedente se cobra a la tarifa del escalón del volumen total. Confirmado y **ya implementado** en el motor de cálculo.
- **✅ Bloque B — "Bolsa" es un 4° modelo de cobro** (monto plano por banda de volumen, sin multiplicar por unidad) y **"recargo fijo"** (ej. mantenimiento) es un cargo aditivo independiente que se suma siempre. Confirmado e **implementado** (`backend/db/07_bolsa_mantenimiento.sql`, motor de cálculo, editor de recargos en el frontend).
- **✅ Bloque D — Contratos/mínimos compartidos entre distintos NIT** (Circular 001, contrato 1945, 11 sub-cuentas de GRUPO OSPEDALE): confirmado que son facturas independientes por NIT, no facturación consolidada. El modelo actual ya alcanza, sin cambios de código.
- **✅ Bloque E — Un dato reclasificado** (Hospital San José): cliente confirmado como retirado.
- **✅ Bloque F — Años de tarifa dudosos** (5 casos): 2 confirmados correctos, 1 cliente retirado, 1 valor descartado definitivamente, 1 dato reatribuido (no pertenecía a SAN RAFAEL).
- **✅ Bloque G — Nombres/atribuciones informativos** (typos, clientes retirados sin fecha): todos confirmados y corregidos.
- **🟡 Bloque C — Servicios que se facturan pero no tienen ninguna tarifa registrada** (13 casos, incluye ~$74M/mes en SEGUROS: SEGUROS DEL ESTADO, LIBERTY, AXA, PREVISORA, HDI, entre otros): **sigue sin resolver** — pasa a ser trabajo de Fase 2, porque requiere que Contabilidad entregue la tarifa/contrato real de cada caso para poder cargarlos.

**3 clientes retirados** ya aplicados directamente en producción (Sociedad de Cirugía–Hospital San José, HUSI, Clínica Universidad de la Sabana). ⚠️ Nota operativa: esto se hizo por `PATCH` manual, no por script de migración — si la base de datos de Railway se reconstruye desde cero (ha pasado antes por incidentes de plataforma), estos 3 retiros se pierden y hay que reaplicarlos.

---

## Fase 2 — Integración con los registros de todos los clientes 🟡 PENDIENTE

Con el modelo de cobro ya validado (Fase 1), lo que falta es **cobertura de datos**: que todos los clientes y servicios reales queden cargados con su tarifa correcta. Trabajo identificado:

- **Bloque C sin resolver** (arriba): conseguir tarifa/contrato de ~13 servicios que hoy se facturan sin tabla de tarifa registrada, el de mayor impacto (~$74M/mes en SEGUROS).
- **~55-61 clientes con NIT temporal (`PEND-<hash>`)**: el cruce automático nombre→NIT entre el Excel de contratos y el maestro de facturación (`DATACLIENTES`) falló por diferencias de nombre. Existe una pantalla de Reconciliación (backend + frontend) ya construida y probada — falta que Contabilidad la use para confirmar los cruces restantes.
- **Tarifas 2026 pendientes**: solo 42 de 101 tablas de tarifas tienen el año 2026 cargado; el resto necesita que Contabilidad confirme o cargue el valor vigente (12 bloques quedaron con año ambiguo en el Excel y no se adivinaron a propósito).
- **9 bloques del parser a revisión** y **2 fallidos** (ECOPETROL — tarifa variable mes a mes por acta, sin tabla fija; FUNDACIÓN CARDIO INFANTIL).
- **2 conflictos reales sin cargar**: Orden Hospitalaria San Juan de Dios y Grupo Telesentinel (tablas contradictorias en el Excel — no se cargó nada para evitar poner un precio erróneo).
- **Clientes ya identificados como retirados pero aún no migrados**: Comfenalco Valle, Auros Copias, Deltagas, Grupo ACO, Grupo Nutresa, JLT — deben crearse directamente con `estado: retirado` cuando se carguen (Legis, del mismo bloque, sigue activo).
- **Tasa de retención en la fuente (RteFte)**: varía por cliente (3,5% / 4%); hoy el sistema solo tiene un valor global por defecto — falta la tabla real por cliente antes de producción.
- **Verificación en vivo del Maestro de Facturación** (Etapa 2 técnica: cuenta contable, centro de costo, código SIIGO/iFactura) — construido pero pendiente de reconciliación final con Contabilidad.

---

## Fase 3 — Generación automática de factura vía iFactura y SIIGO ⏸️ PENDIENTE

**No arrancada.** Bloqueada desde el diseño hasta confirmar con el proveedor:

- ¿iFactura expone una API de emisión (CUFE/DIAN)? ¿Con qué credenciales y formato?
- ¿Qué API expone SIIGO para recibir las facturas emitidas?

Cuando se confirme, el diseño previsto es: emisión en lote de todo lo **aprobado** en el pre-liquidado → iFactura (obtiene CUFE/DIAN) → actualiza estado (facturado/rechazado) → SIIGO, con idempotencia obligatoria (clave cliente+servicio+periodo) sobre el gate de aprobación humana que ya existe hoy.

**Principio de diseño que ya rige todo el sistema y seguirá aplicando aquí:** el cálculo del monto a facturar nunca lo decide una IA — es un motor determinístico y auditable, y toda factura requiere aprobación humana explícita antes de considerarse válida.

---

## Qué habilita avanzar a Fase 2 ahora mismo

Ya existen las herramientas técnicas para cerrar Fase 2 sin nuevo desarrollo — es trabajo de **datos y confirmación con Contabilidad**, no de construcción:
1. Usar la pantalla de Reconciliación para cruzar los ~55-61 NIT pendientes.
2. Obtener de Contabilidad la tarifa de los 13 casos del Bloque C.
3. Confirmar o cargar las tarifas 2026 faltantes (59 de 101 tablas).
4. Definir la tabla de RteFte por cliente.
