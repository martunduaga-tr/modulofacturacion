# PRD — Sistema de Facturación Automatizada (COE)
**Transfiriendo S.A. · Innovación & IA**

| | |
|---|---|
| **Autor** | Juan Ignacio De La Fuente / Innovación & IA |
| **Versión** | 1.0 — Etapa 1 detallada, Etapas 2–4 esbozadas |
| **Estado** | Borrador para iniciar desarrollo con Claude Code |
| **Stack objetivo** | NestJS 10 + React + SQL Server (on-premise) + n8n |

---

## 1. Contexto y problema

El área de Contabilidad factura mensualmente a ~700 empresas por los ~34 productos del portafolio de Transfiriendo (iFactura, iSeguros, iRecaudo, Bizuit, FirmaFacil, etc.). El proceso vive hoy en **múltiples archivos Excel** (uno o varios por producto). El archivo analizado en este PRD corresponde a iFactura y mezcla cuatro responsabilidades distintas:

1. **Tarifas pactadas por cliente** (hoja `CONTRATOS COE`) — la lógica de cobro real.
2. **Volúmenes de operación** (hojas `DATOS PRODUCCION`, `INFO. TRANS. COE`, `H.T`) — extraídos a mano con queries a la base de datos.
3. **Cálculo de la factura** (hoja `MATRIZ FACTURACION`) — cruce manual NIT→tarifa→año + cascada tributaria.
4. **Parámetros globales** (hoja `PARAMETROS`) — IPC, TRM, tasas de retención.

El cuello de botella no es el cálculo de impuestos (ya son fórmulas), sino el **cruce manual de cada NIT contra su tabla de tarifas para identificar el escalón y el precio del año vigente**, y la posterior **transcripción de las 700 facturas a SIIGO e iFactura una por una**.

### Objetivo general
Reemplazar el Excel por un sistema de software por capas, manteniendo control humano de aprobación antes de emitir, con trazabilidad fiscal completa.

### Hallazgo técnico clave (validado contra los datos reales)
El cálculo por volumen **NO es por tramos acumulados**. El escalón (DE/HASTA) sirve únicamente para *seleccionar* una tarifa unitaria según el volumen total del mes; luego **todo el volumen se multiplica por esa única tarifa**.

> Verificación: AXA (NIT 860002184), 243.936 transacciones × $50.904 = $12.417.318 = subtotal exacto de la matriz.

Esto simplifica el motor: es un *lookup de escalón* + una *multiplicación*, no una suma de tramos.

---

## 2. Modelos de cobro identificados en el Excel

A partir del análisis de la hoja `CONTRATOS COE` (~90+ clientes con tarifa configurada), existen estos modelos:

| Modelo | Descripción | Ejemplo en el Excel |
|---|---|---|
| **Por volumen escalonado** | Tabla DE/HASTA → tarifa unitaria por escalón; se multiplica todo el volumen por la tarifa del escalón en que cae. | Grupo Nutresa, AXA, Drug Store |
| **Mínimo garantizado** | Si `volumen × tarifa < mínimo`, se cobra el mínimo. El mínimo también se incrementa por año. | Clientes con fila `MINIMO GARANTIZADO` |
| **Fijo mensual** | Monto fijo independiente del volumen. | Columna `FIJO MENSUAL` de la matriz |

> **Los 3 modelos son los mismos para todos los productos.** El motor de cálculo no cambia según el producto; lo único que varía es la tabla de tarifa asociada. Esto es clave: un solo motor cubre los ~34 productos.

### Dimensión de producto (CRÍTICO — alcance real del sistema)

El Excel que se analizó corresponde a **un solo producto: iFactura** (con sus conceptos *emisión* y *recepción*). Pero Transfiriendo factura por **~34 productos del portafolio** (iFactura, iSeguros, iRecaudo, Bizuit, FirmaFacil, etc.), cada uno con su propia matriz de tarifas. Hoy esto vive en **múltiples archivos Excel** (varía: algunos productos comparten archivo, otros tienen el suyo).

Por lo tanto, el sistema no modela "emisión vs. recepción" como un caso especial, sino una jerarquía general de tres niveles:

```
PRODUCTO (iFactura, iSeguros, iRecaudo, … ~34)
   └── CONCEPTO FACTURABLE (ej. en iFactura: emisión, recepción)
          └── TARIFA por cliente (escalonado / mínimo / fijo), versionada por año
```

Lo que antes se trató como "tablas separadas de emisión/recepción" (caso Apergy) es simplemente **un producto con dos conceptos facturables**. El modelo de datos se generaliza para que cualquier producto pueda tener N conceptos, y cada concepto su propia tabla de tarifa por cliente y año.

> **Implicación para la migración (RF-6):** la importación inicial debe poder correrse archivo por archivo (un Excel = uno o varios productos), etiquetando cada bloque migrado con su producto y concepto.

### Versionado por año (IPC)
Cada tabla de tarifa tiene **una columna de precio por año** (2017, 2018, … 2026), porque cada año el precio se incrementa por IPC. La hoja guarda tanto el precio ya calculado por año como el factor IPC anual usado.

> Decisión de diseño: el sistema debe almacenar el **precio efectivo por año** (no recalcularlo desde el IPC), para reproducir exactamente lo que hoy se factura y mantener auditabilidad. El IPC se guarda como metadato/referencia.

### Parámetros tributarios (hoja PARAMETROS)
Constantes globales del cálculo, aplicables según los términos de cada cliente:

| Concepto | Tasa |
|---|---|
| IVA | 19% |
| Autorretención | 0,8% |
| Retención en la fuente (RteFte) | 3,5% / 4% |
| Retención de IVA (RteIVA) | 15% |
| Retención de ICA (RteICA) | 0,966% |
| IPC vigente | 5,2% |
| TRM | configurable |

---

## 3. Alcance por etapas

> El proyecto se entrega en 4 etapas incrementales. **La Etapa 1 es el quick win y el foco de este PRD.** Las etapas 2–4 se describen a alto nivel para dar contexto de la visión completa, pero su detalle se especificará en PRDs posteriores.

```
Etapa 1  →  Migrar y gestionar CONTRATOS COE (CRUD de tarifas)        ← ESTE PRD
Etapa 2  →  Digitalizar la MATRIZ DE FACTURACIÓN (cabecera de factura)
Etapa 3  →  Ingesta automática de volúmenes + motor de cálculo
Etapa 4  →  Generación automática de facturas (iFactura API + SIIGO)
```

---

## 4. ETAPA 1 — Gestión de contratos y tarifas (QUICK WIN)

### 4.1 Objetivo
Sacar las tarifas del Excel y llevarlas a una aplicación web sobre SQL Server, donde Contabilidad pueda **consultar, crear, editar y versionar** las tarifas de cada cliente sin tocar fórmulas ni celdas. Esta etapa **no calcula facturas todavía** — su entregable es una fuente de verdad confiable y editable de las tarifas.

### 4.2 Valor
- Elimina el riesgo de romper fórmulas del Excel al editar una tarifa.
- Permite que varias personas trabajen sin bloquear el archivo.
- Deja la base de datos lista para que las etapas siguientes consuman las tarifas por API.
- Trazabilidad: quién cambió qué tarifa y cuándo.

### 4.3 Usuarios
| Rol | Permisos |
|---|---|
| **Contabilidad (editor)** | Ver, crear y editar contratos y tarifas. |
| **Administrador** | Todo lo anterior + gestionar usuarios y parámetros globales. |
| **Lector** | Solo consulta (ej. operaciones, auditoría). |

### 4.4 Modelo de datos (SQL Server)

Estructura normalizada que reemplaza las hojas `CONTRATOS COE` de **todos** los productos:

```
productos
  id (PK)
  codigo            -- ej. IFACTURA, ISEGUROS, IRECAUDO, BIZUIT, FIRMAFACIL
  nombre
  estado            -- activo / inactivo

conceptos_facturables
  id (PK)
  producto_id (FK → productos)
  codigo            -- ej. EMISION, RECEPCION (un producto puede tener N conceptos)
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
  cliente_id (FK → clientes)
  nombre_contrato   -- ej. "Otro Sí No.1 SG-001"
  vigencia_desde
  vigencia_hasta
  estado            -- activo / inactivo
  observaciones

contrato_items
  id (PK)
  contrato_id (FK → contratos)
  producto_id (FK → productos)
  concepto_id (FK → conceptos_facturables)
  modelo_cobro      -- ENUM: volumen_escalonado | minimo_garantizado | fijo_mensual
  -- un contrato puede facturar varios productos/conceptos; cada uno es un item
  -- y cada item define su propio modelo de cobro y su propia tabla de tarifa

tarifa_escalones
  id (PK)
  contrato_item_id (FK → contrato_items)
  volumen_desde
  volumen_hasta
  anio              -- 2017 … 2026
  precio_unitario
  ipc_aplicado      -- metadato/referencia

minimo_garantizado
  id (PK)
  contrato_item_id (FK → contrato_items)
  anio
  valor_minimo

tarifa_fija
  id (PK)
  contrato_item_id (FK → contrato_items)
  anio
  valor_fijo

parametros_globales
  id (PK)
  clave             -- IVA, RTEFTE, RTEICA, RTEIVA, AUTORRETENCION, IPC, TRM
  valor
  vigencia_desde

auditoria_cambios
  id (PK)
  tabla, registro_id, usuario, accion, valor_anterior, valor_nuevo, fecha
```

> **Cambio clave respecto a la v1:** las tarifas ya no cuelgan directamente del contrato, sino de un `contrato_item`, que es la combinación **contrato + producto + concepto**. Así, un mismo cliente puede tener iFactura-emisión escalonado, iFactura-recepción con mínimo, e iSeguros fijo mensual, todo bajo su contrato, y el sistema lo maneja de forma uniforme. La tabla central de tarifa sigue siendo `tarifa_escalones`, ahora referida al item: "para este cliente, producto, concepto y año, los documentos entre X y Y se cobran a Z pesos".

### 4.5 Funcionalidades (requisitos)

**RF-1 — Listado de clientes/contratos**
Tabla buscable y filtrable por NIT, razón social, modelo de cobro y estado. Indicador visual del modelo de cobro de cada contrato.

**RF-2 — Ver detalle de un contrato**
Muestra la tabla de escalones por año, el mínimo garantizado (si aplica), y separación emisión/recepción cuando corresponda. Vista de solo lectura clara, tipo "ficha del contrato".

**RF-3 — Crear nuevo contrato**
Formulario guiado: datos del cliente → agregar uno o más **items** (producto + concepto facturable) → por cada item, elegir modelo de cobro → captura de escalones / mínimo / valor fijo → años de vigencia. Validaciones:
- Los rangos DE/HASTA no se solapan ni dejan huecos dentro de un mismo item/año.
- `volumen_desde ≤ volumen_hasta`.
- Precio > 0.
- No se permite guardar un item sin al menos una tarifa válida.
- Un mismo contrato puede combinar varios productos/conceptos con modelos de cobro distintos.

**RF-4 — Editar tarifas existentes**
Edición de escalones, precios por año y mínimos. Toda edición queda registrada en `auditoria_cambios`.

**RF-5 — Versionado por año**
Agregar el precio de un nuevo año a un contrato existente (ej. aplicar IPC y cargar precios 2027) sin duplicar el contrato. Opcional: utilidad que sugiere los precios del nuevo año aplicando el IPC al año anterior, que el usuario revisa y confirma antes de guardar.

**RF-6 — Importación inicial desde los Excel**
Script/proceso de migración que lee las hojas `CONTRATOS COE` (u equivalentes) de **cada archivo Excel de cada producto** y carga productos, conceptos, clientes, contratos, items y escalones a SQL Server. Como hay ~34 productos repartidos en múltiples archivos (algunos compartidos), la migración debe poder correrse **archivo por archivo**, etiquetando cada bloque migrado con su **producto y concepto**. Debe generar un **reporte de migración** indicando qué bloques se cargaron bien y cuáles requieren revisión manual (bloques con formato irregular, clientes retirados, tablas no habilitadas). Esta migración es incremental (se corre una vez por archivo a medida que se incorpora cada producto).

**RF-7 — Gestión de productos y conceptos**
Pantalla de administrador para dar de alta los ~34 productos del portafolio y sus conceptos facturables (ej. iFactura → emisión, recepción). Es prerrequisito de la carga de tarifas.

**RF-8 — Gestión de parámetros globales**
Pantalla de administrador para editar IVA, retenciones, IPC y TRM con vigencia.

**RF-9 — Auditoría**
Registro de todos los cambios (usuario, fecha, valor anterior/nuevo) consultable por administrador.

### 4.6 Requisitos no funcionales
- **Infraestructura on-premise**, sobre el SQL Server corporativo existente.
- Autenticación por roles (integrable luego con el directorio corporativo).
- La base de datos debe quedar consumible por API REST para las etapas 2–4.
- Cero pérdida de información respecto al Excel: toda tarifa migrada debe poder reproducirse.
- Interfaz en español, alineada al uso de Contabilidad.

### 4.7 Criterios de aceptación (Etapa 1)
- [ ] Los ~34 productos del portafolio y sus conceptos facturables quedan dados de alta.
- [ ] Las tarifas del Excel de iFactura (las ~90+ configuradas) quedan migradas y verificables contra el archivo original.
- [ ] La migración puede correrse para un segundo archivo/producto sin cambios de código (solo configuración).
- [ ] Contabilidad puede crear un contrato nuevo con varios items (producto+concepto) y los 3 modelos sin asistencia técnica.
- [ ] Contabilidad puede editar una tarifa y agregar el precio de un nuevo año.
- [ ] Toda edición queda registrada en auditoría.
- [ ] El Excel deja de ser la fuente de edición de tarifas.

### 4.8 Fuera de alcance (Etapa 1)
- Cálculo de facturas.
- Ingesta de volúmenes.
- Integración con iFactura o SIIGO.

---

## 5. ETAPA 2 — Digitalización de la matriz de facturación *(esbozo)*

Llevar la hoja `MATRIZ FACTURACION` a la base de datos: la cabecera de cada factura por cliente (NIT, centro de costo, cuenta contable, concepto, descripción, código iFactura/SIIGO, plazo, correo). Es el "maestro de facturación" que define *qué* se factura a cada cliente y *cómo* se contabiliza, independientemente del monto.

**Entregable:** CRUD de las líneas de facturación recurrente por cliente, vinculadas al contrato de la Etapa 1.

---

## 6. ETAPA 3 — Ingesta de volúmenes + motor de cálculo *(esbozo)*

Automatizar lo que hoy hace operaciones a mano:
1. **Ingesta:** queries parametrizados (vista o procedimiento en SQL Server) que devuelven el volumen mensual por NIT y tipo de servicio (emisión/recepción), reemplazando el pegado manual en `H.T`.
2. **Motor de cálculo (determinístico):** para cada cliente → toma su volumen → busca el escalón y precio del año vigente (Etapa 1) → multiplica → aplica mínimo garantizado → corre la cascada tributaria (Etapa 1 parámetros) → guarda un **pre-liquidado** con su desglose completo.
3. **Validación con IA (no calcula, solo señala):** marca anomalías — volumen cero inusual, monto fuera del histórico, tarifa vencida, cliente sin contrato.
4. **Dashboard de aprobación:** Contabilidad revisa los 700 montos calculados con su desglose y aprueba antes de emitir.

**Principio rector:** el cálculo es determinístico y auditable; la IA solo asiste la revisión; hay aprobación humana obligatoria.

---

## 7. ETAPA 4 — Generación automática de facturas *(esbozo)*

Emitir lo aprobado sin transcripción manual:
- **iFactura:** emisión en lote vía API (a confirmar si iFactura expone API de emisión — es producto propio de Transfiriendo). Recepción de CUFE/respuesta DIAN, marcado de estado.
- **SIIGO:** contabilización del comprobante.
- **n8n:** orquesta el ciclo mensual completo (ingesta → cálculo → validación → notificación de aprobación → emisión → contabilización).
- **Idempotencia:** garantías para no doble-facturar ante reintentos.

---

## 8. Riesgos y consideraciones
- **Confiabilidad fiscal:** el cálculo nunca lo hace un LLM; siempre código determinístico + aprobación humana.
- **Calidad de la migración:** algunos bloques del Excel tienen formato irregular; la Etapa 1 debe reportarlos para corrección manual, no asumir.
- **API de iFactura:** dependencia clave de la Etapa 4; conviene confirmarla pronto con el equipo de producto, aunque no bloquea las Etapas 1–3.
- **Adopción:** la interfaz debe ser tan simple que Contabilidad prefiera la app al Excel.

---

## 9. Primer incremento sugerido para Claude Code
Para arrancar la Etapa 1 de inmediato:
1. Definir el esquema SQL Server (DDL) de las tablas de la sección 4.4, incluyendo `productos`, `conceptos_facturables` y `contrato_items`.
2. Backend NestJS: módulos `productos`, `conceptos`, `clientes`, `contratos` (con items), `tarifas`, `parametros`, `auditoria` con API REST.
3. Generar el script de migración del Excel de iFactura (parametrizable por producto/archivo) con reporte de resultados.
4. Frontend React: alta de productos/conceptos (RF-7), listado (RF-1), ficha de contrato (RF-2), formulario de creación/edición con items (RF-3, RF-4, RF-5).
5. Autenticación por roles.
