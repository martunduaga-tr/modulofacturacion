# Sistema de Facturación Automatizada COE — Transfiriendo S.A.S.

> Documento de contexto para presentación a Junta Directiva.
> Corte de información: 25 de agosto de 2026.

---

## 1. El problema que resuelve

El área de Contabilidad de Transfiriendo factura mensualmente a **cerca de 700 empresas** por los **~34 productos del portafolio** de la compañía (iFactura, iSeguros, iRecaudo, Bizuit, FirmaFácil, entre otros).

Hoy ese proceso vive completo en **archivos Excel** — uno o varios por producto — que mezclan cuatro responsabilidades distintas en la misma hoja:

1. El catálogo de clientes y sus contratos.
2. Las tablas de tarifas por cliente (escalones de volumen, precios por año).
3. El cálculo de cada factura: cruce manual de NIT → tarifa → año vigente → cascada de impuestos (IVA, retenciones).
4. La transcripción manual de las ~700 facturas resultantes a los sistemas SIIGO e iFactura.

**El cuello de botella no es calcular impuestos** (eso ya son fórmulas de Excel). El riesgo real está en dos puntos manuales y repetitivos cada mes:

- Cruzar a mano cada cliente contra su tabla de tarifas para encontrar el escalón y el precio del año correcto — un error aquí se traduce directamente en una factura mal emitida.
- Transcribir una por una las ~700 facturas resultantes a los sistemas contables, sin trazabilidad de quién tocó qué ni cuándo.

Un Excel de este tamaño y complejidad no ofrece control de acceso por rol, historial de cambios, ni validación en el momento de editar una tarifa — cualquier fórmula rota o celda mal editada puede pasar desapercibida hasta que ya generó una factura incorrecta.

## 2. Qué estamos construyendo

Una aplicación web interna que reemplaza el Excel por capas, sin intentar automatizar todo de una vez. El objetivo de negocio se resume en una frase:

> **Contabilidad prefiere la app al Excel** porque es más clara, más segura y más rápida — no porque se les obligue a migrar.

El sistema se construye en **etapas**, cada una entregando valor independiente y verificable antes de avanzar a la siguiente:

| Etapa | Qué resuelve | Estado |
|---|---|---|
| **1. Fuente de verdad editable** | Contratos, clientes y tarifas dejan de vivir en Excel y pasan a una base de datos con control de acceso, validación y trazabilidad de auditoría (quién cambió qué y cuándo). | ✅ Completa |
| **2. Maestro de facturación** | Los datos contables de cómo se factura cada cliente (cuenta contable, centro de costo, código SIIGO/iFactura) quedan editables y vinculados a los contratos. | ✅ Backend y frontend construidos — pendiente reconciliación final con Contabilidad |
| **3. Motor de cálculo + pre-liquidado** | Cálculo automático y determinístico de cada factura (volumen × tarifa × cascada tributaria), con un panel donde Contabilidad revisa y **aprueba antes de que cualquier monto se considere válido**. | 🟡 En curso — motor probado y en producción, ingesta de volúmenes funcionando |
| **4. Emisión automática** | Envío de las facturas aprobadas directamente a iFactura/SIIGO, sin transcripción manual. | ⏸️ En pausa — depende de confirmar con el proveedor si iFactura expone una API de emisión |

## 3. Principio no negociable: el cálculo nunca lo decide una IA

El motor que calcula cuánto se le cobra a cada cliente es **determinístico** — código auditable con reglas fijas (subtotal por modelo de cobro, cascada tributaria colombiana), no un modelo de lenguaje. Cada cálculo:

- Es reproducible: los mismos datos de entrada siempre producen el mismo resultado.
- Queda trazado con su desglose completo (de dónde salió cada peso del monto final).
- Requiere **aprobación humana explícita** antes de considerarse válido — nada se factura automáticamente sin que alguien de Contabilidad lo revise y apruebe.

Esto es deliberado: un valor inventado o mal calculado no puede terminar en una factura real.

## 4. Avance real hasta la fecha

- **Migración de datos históricos:** 99 contratos y 99 clientes migrados y verificados contra el Excel original, con cero diferencias en una muestra de 255 precios contrastados manualmente.
- **Motor de cálculo:** probado con casos reales (ej. cliente AXA: $12.417.318,14 calculado correctamente; mínimo garantizado con IVA verificado). Corrió un mes completo de prueba: 10 facturas calculadas automáticamente y aprobadas.
- **Aplicación en producción:** desplegada y accesible para el equipo, con el sistema de diseño e identidad de marca de Transfiriendo ya aplicado (colores, tipografía, logo institucional).
- **Módulos completos:** gestión de contratos, clientes, productos/tarifas, parámetros tributarios, auditoría, usuarios por rol, panel de alertas (contratos sin tarifa vigente, tarifas incompletas, datos pendientes de corregir) y panel de aprobación de pre-liquidados.
- **Contratos híbridos:** soporte para clientes cuyo contrato agrupa varios servicios distintos que se facturan de forma conjunta — un caso real de complejidad del negocio que ya está resuelto en el modelo de datos.

## 5. Lo que falta y depende de decisiones de negocio

Estos puntos **no son trabajo técnico pendiente** — son decisiones o validaciones que solo puede resolver el negocio:

- **Calidad del dato migrado:** ~55 clientes quedaron con NIT temporal (placeholder) porque su nombre en el Excel de contratos no coincide exactamente con el del maestro de facturación — requiere que Contabilidad confirme el cruce correcto.
- **Tarifas 2026 pendientes:** 42 de 101 tablas de tarifas ya tienen el año 2026 cargado; el resto necesita que Contabilidad confirme o cargue el valor vigente.
- **Tasas de retención en la fuente (RteFte):** varían por cliente (3,5% / 4%) y hoy el modelo solo tiene un valor global por defecto — se necesita la tabla real por cliente.
- **Etapa 4 (emisión automática) en pausa:** requiere confirmación del proveedor de iFactura sobre si existe una API de emisión de facturas (CUFE/DIAN) y en qué condiciones. Sin esa confirmación no se construye la integración.

## 6. Por qué importa para la Junta

- **Reduce el riesgo operativo y fiscal** de facturar $ incorrectos a ~700 clientes por errores de transcripción manual en Excel — hoy sin ningún control de trazabilidad.
- **Reduce el tiempo del ciclo de facturación mensual**, al eliminar el cruce manual cliente→tarifa y (en la Etapa 4) la transcripción manual a los sistemas contables.
- **Deja un rastro de auditoría completo** — quién cambió una tarifa, cuándo, y quién aprobó cada factura — algo que el Excel actual no ofrece.
- **Escala a los ~34 productos del portafolio** con el mismo motor de cálculo: el diseño no depende del producto, solo de la tabla de tarifas asociada, por lo que agregar un nuevo producto no requiere reescribir el sistema.
- **Construido de forma incremental y verificable**: cada etapa se probó contra datos reales antes de avanzar a la siguiente, en vez de un proyecto "big bang" de alto riesgo.

---

*Documento preparado a partir del estado real del proyecto (`ESTADO_PROYECTO.md`, `PRODUCT.md`, `PRD_Sistema_Facturacion_Transfiriendo.md`) al 25 de agosto de 2026.*
