# ESTADO DEL PROYECTO — Sistema de Facturación Automatizada (COE)

> Fuente de verdad del avance. Orquestador y planificador lo leen y actualizan cada sesión.
> Última actualización: 2026-07-30 por Orquestador (Design System de Transfiriendo aplicado, Fase 1 — tokens/tipografía/marca)

## Etapa actual
**Etapa 3 — Ingesta de volúmenes + motor de cálculo.** Backend COMPLETO: motor (probado), ingesta de volúmenes por Excel, y servicio de pre-liquidado con aprobación. Probado end-to-end (2026/1: 10 calculados). Sigue: dashboard de aprobación (frontend), validación IA de anomalías, y calidad de dato (tarifas reales + reconciliación).

## Resumen de una línea
**Etapa 1 completa. Etapa 2** esencialmente completa (falta verificación en vivo por conflicto de puerto SQL). **Etapa 3 arrancada:** motor determinístico blindado (AXA=12.417.318,14; mínimo 183.906→IVA 34.942,14) + DDL de `volumenes`/`pre_liquidados`. Decidido: los volúmenes también entran por Excel por ahora.

---

## Tablero

### Hecho
- [x] PRD redactado y validado (2026-06-03)
- [x] Skills del proyecto configuradas (2026-06-03)
- [x] Repositorio git inicializado, commit baseline (2026-06-03)
- [x] DDL de SQL Server aprobado — `database/01_schema.sql` + `02_seed.sql` (2026-06-03)
- [x] Backend: scaffold NestJS + TypeORM + 11 entidades + módulo `productos` (RF-7), build OK (2026-06-03)
- [x] Backend: módulos clientes, contratos (+items, transaccional), tarifas (validación + RF-4/RF-5), parametros, auditoria, auth (JWT+roles), build OK (2026-06-03)
- [x] **Backend VALIDADO contra SQL Server real (Docker)** (2026-06-05): DDL+seed aplicados, API levantada, probado login/JWT/roles, CRUD productos+conceptos, unicidad por constraint (409), guard (401), validación DTO (400), creación transaccional de contrato con escalones, rechazo de solapamiento (400), auditoría registrando. Mapeo entidad↔tabla correcto de punta a punta.

- [x] **Migración iFactura CARGADA y verificada (2026-06-05)** (RF-6): parser `migration/parse_contratos_coe.py` (121 tablas, 112 OK) + cargador `migration/cargar_contratos.py` vía API. Cargados 101 contratos, 2678 escalones, 109 mínimos, 102 auditorías. Verificado contra Excel (LEGRAND mín 2022=183906, DRUG STORE 2018=310).

- [x] **Sistema de diseño definido (2026-06-05)**: skill `impeccable` instalada + `PRODUCT.md` y `DESIGN.md`. Estilo: confiable/cálido/claro, primario cobalto, acento ámbar medido, fondo blanco, tipografía Figtree, estrategia restrained.

- [x] **Frontend scaffolded + Login + App shell + Listado (RF-1) + Ficha (RF-2)** (2026-06-05): Vite+React+TS sobre `DESIGN.md`, auth JWT, TanStack Query. Build OK, corriendo en localhost:5173 contra el backend real.
- [x] **Calidez del diseño + fixes** (2026-06-05): tras feedback "demasiado sobrio" → neutrales cálidos + cobalto/ámbar, marca, saludo, jerarquía. Fix backend (orderBy por propiedad, GET /contratos daba 500), fix layout del buscador, fix encoding de acentos (seed con `-f 65001`). Capturas verificadas con Playwright (devDep del front).

- [x] **Frontend: formulario de crear contrato (RF-3) + editor de escalones (2026-06-05)**: React Hook Form, cliente existente/nuevo, items producto→concepto→modelo, editor de escalones con validación en vivo (solape/huecos/precio). Verificado por UI (creó contrato real con Playwright).
- [x] **Frontend: pantallas de administración (2026-06-05)**: Productos+conceptos (RF-7), Parámetros (RF-8), Auditoría (RF-9), Usuarios. Modal y PageHeader reutilizables. Verificado por UI sin errores.
- [x] **Frontend: edición en la ficha (RF-4/RF-5) (2026-06-05)**: editar cabecera (PATCH /contratos), editar año existente y agregar año (TarifaAnioModal). Gated por rol. Verificado por UI (agregó 2027 a un contrato real).

### 🎉 ETAPA 1 ESENCIALMENTE COMPLETA
Todos los RF de Etapa 1 implementados y verificados: RF-1…RF-9 + auth por roles. Backend validado contra SQL real, migración cargada, frontend con CRUD completo. Pendiente: pulido/QA y los pendientes de migración (abajo).

### En curso
- [ ] (nada arrancado)

### Pendiente (Etapa 1 — pulido)
- [ ] QA/pulido del frontend (revisar responsive, estados de error, edge cases) — opcional `impeccable polish`.
- [ ] (Opcional) baja lógica de productos/conceptos y edición de usuarios desde la UI.

### Evaluación + rediseño visual (`/impeccable redesign`, 2026-07-30)
Evaluación completa de las 15 pantallas (sin detector `detect.mjs` disponible en esta instalación ni navegador conectado esta sesión — evaluación degradada, solo lectura de código). Puntaje 26/40. Hallazgo central: las pantallas administrativas (Productos/Parámetros/Usuarios) pesan visualmente igual que crear un contrato, aunque Parámetros cambia impuestos de TODA la facturación futura con un clic. `DESIGN.md` ya documentaba Toast y "Diálogo de confirmación" como componentes — no existían en el código.
- [x] **P1 cerrado**: `ToastProvider`/`useToast` (`frontend/src/components/ui/ToastProvider.tsx`) y `ConfirmDialog` (sobre el `Modal` existente) construidos desde cero, siguiendo los tokens OKLCH ya definidos (sin dependencia nueva). Conectados en: Parámetros (confirmación obligatoria antes de guardar una tasa tributaria, variante "peligro"), baja lógica de contrato en `ContratoFichaPage` (confirma solo cuando el cambio de estado es activo→inactivo), y toasts de éxito/error en creación de contratos/productos/conceptos/usuarios, edición de tarifas y aprobación de pre-liquidados.
- [x] **P2 cerrado (alcance ajustado, ver nota)**:
  - `ContratosPage` y `ProductoDetallePage` reimplementaban su propio header a mano (CSS module uno, `style={{}}` el otro) en vez de usar `<PageHeader>` como las otras 8 pantallas — unificados. `PageHeader.subtitulo` ahora acepta `ReactNode` (antes solo `string`) para poder llevar el código del producto en `mono`.
  - **Parámetros** ahora tiene un aviso visible (`--warn`/`--warn-weak`, ya existentes) explicando que esos valores alimentan toda la facturación futura — la única pantalla administrativa que de verdad necesitaba destacarse por riesgo.
  - `formatearPorcentaje` nuevo en `format.ts`: reemplaza el formateo manual duplicado 3 veces dentro de `ParametrosPage`.
  - `AlertasPage`: los chips de severidad ya no cambian de paleta al (de)seleccionarse (antes: seleccionado=badge con punto, no seleccionado=gris) — un solo lenguaje visual (color de severidad siempre visible, un aro `currentColor` marca el activo).
  - **Nota de alcance**: la evaluación original decía "migrar estilos inline a CSS modules"; al revisar, son 95 usos en 20 archivos, la mayoría patrones de layout puntual legítimos (incluso en componentes compartidos como `Feedback.tsx`/`PageHeader.tsx`) — un refactor mecánico grande sin el valor que sugería el hallazgo. Se acotó a los casos concretos que sí eran el problema real (los dos headers duplicados). Tampoco se diferenció Productos/Usuarios visualmente — ya eran apropiadamente discretos; forzar una identidad distinta ahí habría sido diferenciar por diferenciar, no por riesgo real.
- Playwright MCP quedó instalado y conectado (`claude mcp add playwright`) pero sus herramientas no cargaron en esta sesión — un servidor agregado a mitad de sesión no se expone hasta reiniciar. Pendiente: reiniciar sesión para poder verificar visualmente en `https://frontend-production-dcae.up.railway.app/`.
- Reporte completo de la evaluación (heurísticas de Nielsen, anti-patrones, personas) quedó en el chat de esa sesión — no se persistió snapshot porque el target era "toda la plataforma", no un archivo/URL puntual (fuera del alcance de `critique-storage.mjs`).

### Módulo de Clientes + recarga de clientes (2026-07-30)
Tras un incidente (el usuario borró por error el servicio `sqlserver` de Railway al intentar limpiar un volumen dañado), se recreó el servicio (`service_id` nuevo `30764aa4-324d-40f5-a2ce-84eaf17c3a0e`) y se recargaron 99 contratos/97 clientes. Luego, a pedido del usuario, se **borraron contratos y clientes** (`backend/scripts/limpiar-contratos.js`, mantenimiento puntual) para recargar solo clientes primero y construir el módulo de Clientes.

- **Investigación del Excel `CONTRATOS COE`** (antes de cargar nada): se confirmó que "documento soporte" y "nómina" (submodalidades que el usuario recordaba) **NO existen en esta hoja** — solo EMISION/RECEPCION. Sí existen 5 notas explícitas "cliente retirado" en el Excel; se cruzaron contra la clasificación de vigencia ya usada (corte 2023) y **coinciden en todos los casos** — no hubo que corregir nada.
- **`migration/cargar_clientes.py` (nuevo)**: carga SOLO clientes (sin contratos), calculando activo/retirado offline desde `bloques_parseados.json` con la misma regla que `revisar_vigencia_2026.py --ultimo-anio 2023` (tiene 2026 → activo; año ambiguo en el Excel → activo protegido; factura después de 2023 sin 2026 → activo reciente; si no, retirado). **99 clientes creados** (70 activos/29 retirados) — 2 más que los 97 anteriores porque este cargador SÍ crea el cliente aunque su tabla de tarifa haya fallado (ECOPETROL, FUNDACION CARDIO INFANTIL), a diferencia de `cargar_contratos.py` que solo crea el cliente si logra construir un contrato.
- **Backend** (`clientes.service.ts`, `cliente.entity.ts`): `GET /clientes` ahora trae `contratosCount` (via `loadRelationCountAndMap`, sin N+1); `GET /clientes/:id` trae `contratos` con `items→conceptos→producto/concepto` anidados (para que el frontend derive "servicios vinculados" sin un DTO especial). Sin columnas nuevas — todo derivado.
- **Frontend**: `ClientesPage` (listado: NIT/razón social, estado, conteo de contratos, filtro por estado) + `ClienteDetallePage` (NIT, estado, correo, servicios vinculados derivados, tabla de contratos con link a la ficha). `ContratoFichaPage`: el nombre del cliente ahora enlaza a su detalle. Nueva entrada "Clientes" en el menú (ícono `Building2`, distinto de "Usuarios").
- [x] Backend y frontend compilan limpio localmente (`npm run build` en ambos, verificado 2026-07-30).
- [x] **Desplegado a Railway (30-jul, tras levantarse el incidente de plataforma):** backend y frontend en SUCCESS, verificado por API (contratosCount, contratos anidados) y por UI con Playwright contra producción.
- [x] **Contratos recargados**: 99 contratos / 99 clientes, sin duplicados (verificado: SEGUROS DEL ESTADO trae su contrato con item→concepto anidado correctamente). El módulo de Clientes ya muestra datos reales end-to-end.
- [ ] Volumen huérfano `sqlserver-volume-pendiente-resize` (id `f26b0873-fb87-4787-b040-0906353f6c52`) sigue sin borrar (bloqueado por la misma limitación del MCP de `confirm: true`; ver nota en memoria de despliegue).

### Design System de Transfiriendo aplicado — Fase 1 (2026-07-30)
El usuario pidió importar el proyecto de Claude Design **"Transfiriendo Design System"** (`17b674c6-3037-4a24-9c82-748b43afee9b`, vía `DesignSync`) — un sistema derivado del *Manual de Marca Transfiriendo 2024* (naranja `#fc7603` + gris `#565656`, Poppins+IBM Plex Sans+JetBrains Mono, ~25 componentes React), distinto del sistema ad hoc (cobalto/ámbar, Figtree) que tenía el frontend desde junio.

**Decisión de alcance (plan aprobado):** solo Fase 1 — fundación. El propio `DesignSync` advierte contra un reemplazo total; reemplazar la librería de ~25 componentes del sistema nuevo es Fase 2, fuera de esta sesión. Se aprovechó que los 17 `.module.css` y las 25 páginas/componentes del frontend **solo referencian `var(--x)` y clases globales** (nunca hex sueltos) — cambiar los valores en 3 archivos globales reskineó las 15 pantallas sin tocarlas.

- **`frontend/src/styles/tokens.css`**: reescrito con los valores de la dirección Material·claro del sistema nuevo, mismos nombres de variable (`--bg`, `--primary`, `--ink`, etc.) para no tocar los `.module.css`. Cambio de comportamiento clave: `--on-primary` pasó de blanco a `--trf-neutral-900` (`#2f2f2f`) — el naranja de marca NO admite texto blanco (2,72:1) — y se separó `--bg` (lienzo cálido `#f5f4f2`) de `--surface` (blanco `#ffffff`, antes ambos eran `--bg`).
- **`frontend/src/styles/components.css`**: recetas de `.btn*`/`.badge*`/`.input`/`.card`/`.table*` actualizadas — el fill del botón primario ya no cambia de color en hover (usa sombra+elevación, oscurecer el naranja rompe AA), badges con relleno translúcido + borde inset, `.badge-primary` pasó de naranja a tono info/azul (el naranja es acción, nunca decoración pasiva — aplica también al hover de fila de tabla, que dejó de usar `--primary-weak`).
- **Fuentes**: `@fontsource/figtree`+`ibm-plex-mono` → `@fontsource/poppins`+`ibm-plex-sans`+`jetbrains-mono`. Poppins solo en `h1-h3` (momentos de marca); el resto en IBM Plex Sans.
- **`Brand.tsx`**: el `BrandMark` inventado (cuadro de color + ícono lucide) se reemplazó por el isotipo oficial (`assets/isotipo.png` del proyecto de diseño, descargado vía `DesignSync get_file` en base64 y decodificado con Python — PowerShell `[Convert]::FromBase64String` corrompió el archivo en el primer intento, sin causa clara; Python fue confiable). También como favicon.
  - **Pendiente menor**: no se pudo traer `assets/logo.png` (lockup completo con wordmark) — el archivo base64 (~32K caracteres en una sola línea) se truncaba de forma silenciosa al escribirlo vía la herramienta `Write` (isotipo, ~6K caracteres, sí funcionó). Se usa isotipo + texto "Facturación COE / Transfiriendo S.A." como lockup equivalente, que es una combinación válida y no una redibujada del logo.
- Build local verificado (`npm run build`, tsc+vite limpio) y visual verificado con Playwright contra producción tras el deploy: login, contratos, clientes (el módulo construido esta misma sesión se rebrandeó automáticamente sin cambios, buena validación de la estrategia), parámetros — sin texto blanco sobre naranja en ningún botón.
- **`LoginPage` (2026-07-31)**: se implementó la plantilla `templates/slide-login/` del Design System como la pantalla de login real (no la diapositiva estática 16:9 — se adaptó a una pantalla funcional/responsive). Panel de marca (izquierda, oculto <900px): isotipo, "Innovación & IA", eslogan "Juntos creamos ecosistemas de negocio", resplandor naranja radial, copyright con año dinámico. Panel de formulario (derecha): mismo `<form>`/lógica de antes, solo re-estilizado. Copy ajustado a lo que el sistema realmente pide — "Usuario" en vez de "Correo corporativo", porque el backend usa username, no email. Verificado en producción (desktop y móvil 390px) con Playwright, login funcional de punta a punta.
- **Sidebar oscura y colapsable (2026-07-31)**: a pedido del usuario, se investigó el sidebar de referencia en `T:\...\innovacion\anomalytWatch` (otro proyecto de Transfiriendo). Hallazgo importante que se le comunicó al usuario: el código de ese proyecto documenta explícitamente que **abandonó la dirección "nítido"** del Design System (volvió a radios estándar de Tailwind) para igualarse a una tercera referencia — la premisa de que "usa nítido" ya no aplica. Además, su ítem de nav activo usa texto blanco sobre relleno naranja sólido, lo que **incumple la regla de accesibilidad** (2,72:1) que este proyecto ya respeta. Se tomó en cambio el tratamiento correcto y oficial del propio Design System (`components/library/Sidebar.jsx` + `.trf-sidebar` en `css/library.css`): fondo `#2f2f2f` (nuevo token `--sidebar-bg`), ítem activo = relleno naranja translúcido `rgba(252,118,3,.16)` + texto naranja (sin relleno sólido, cumple contraste), colapso a riel de íconos de 72px (`--sidebar-w-collapsed`) con botón chevron abajo, transición 260ms. `Brand.tsx` (con texto) ahora solo se usa en el sidebar — sus colores pasaron a `--sidebar-text`/`--sidebar-text-active`. En móvil (<860px) se mantiene el drawer deslizante existente; el botón de colapso se oculta ahí (redundante con el hamburguesa). Verificado en producción con Playwright: expandido y colapsado, ambos correctos.
- **Fase 2 (futura, no arrancada):** reemplazar `ui/Modal`, `ui/ConfirmDialog`, `ui/ToastProvider`, `ClientePicker`, `EscalonEditor`, `ItemEditor`, `TarifaAnioModal`, `LineaModal`, `AppShell` por los componentes reales del sistema (`Dialog`, `Modal`, `Toaster`, `Combobox`, `DataGrid`, `Sidebar`); adoptar direcciones `calido`/`nitido` o modo oscuro; traer `assets/logo.png` (probablemente por otra vía, ej. `railway`/git en vez de pegarlo en un tool call).

### Migración de CONTRATOS COE cargada en Railway (2026-07-28)
Inventario completo de la hoja en `migration/inventario_contratos_coe.csv` (una fila por tabla, con estado y motivo). De **121 tablas** detectadas:
- **99 contratos cargados** (97 clientes) en la plataforma desplegada. Verificado: 255 precios contrastados contra el Excel en 4 contratos (LEGRAND, DRUG STORE, AXA, SEGUROS DEL ESTADO) → **0 diferencias**; mínimo LEGRAND 2022 = 183.906.
- **11 descartados por tabla repetida.** Un mismo cliente aparece dos veces en la hoja. **Defecto corregido:** el cargador se quedaba con la primera tabla del Excel, que suele ser la más corta y vieja — se perdían los años recientes de AVIDANTI, DOMINA, DRUG STORE, CES, COLOMBIANA DE TRANSPLANTES y FUNDACIÓN CARDIOVASCULAR. Ahora manda la más completa (precios idénticos en los años compartidos, verificado).
  - [ ] **2 conflictos reales para Contabilidad:** `ORDEN HOSPITALARIA DE SAN JUAN DE DIOS` (40 de 50 precios difieren entre sus 2 tablas) y `GRUPO TELESENTINEL` (1 escalón vs 10, sin precios comparables). **Ninguno se cargó** — elegir mal pone un precio erróneo en una factura.
- **9 a revisión** (parser) y **2 fallidos**: ECOPETROL (sin años) y FUNDACION CARDIO INFANTIL (año descartado).
- **57 clientes con NIT placeholder** `PEND-<hash>` → usar la pantalla de Reconciliación.
- **Solo 42 de 101 tablas traen 2026.** Decisión tomada: NO se adivina el año en los 11 bloques con dos columnas rotuladas igual; quedan sin tarifa 2026 hasta que Contabilidad confirme.

**Depuración por vigencia 2026 (2026-07-28)** — `migration/revisar_vigencia_2026.py` (reporte en `reporte_vigencia_2026.txt`). De 97 clientes: **70 activos / 27 retirados** (baja lógica, reversible).
- Se retiraron solo los que **no facturan desde 2023 o antes** (20 de ellos paran en 2022).
- **NO se retiraron los 18 que facturaron en 2024-2025** sin tarifa 2026 (DRUG STORE, FUNDACION SANTA FE, ZURICH, SAN RAFAEL, OFTALMOS, LA EQUIDAD, SHAIO…): "sin tarifa 2026" es casi siempre *pendiente de cargar el año*, no cliente inactivo. → **Contabilidad debe cargarles la tarifa 2026.**
- **NO se retiraron los 11 con año ambiguo**: les falta 2026 por el rótulo mal puesto en el Excel, no por inactividad.
- **Ojo (aprendido 2026-07-28):** `cliente.estado` y `contrato.estado` son campos INDEPENDIENTES. Retirar el cliente no marca sus contratos — `GET /contratos` sin filtro los sigue listando todos (99), por diseño (no oculta nada si no se lo pides explícitamente con `?estado=activo`). Se propagó con `migration/propagar_baja_contratos.py`: los 28 contratos de esos 27 clientes (uno tiene 2 items) ahora en `inactivo`. Resultado: **70 contratos activos / 29 inactivos** de 99 totales.

⚠️ **La base de la nube es EFÍMERA.** El volumen de Railway se creó pero su tamaño por defecto no le alcanza a SQL Server (`No space left on device` al crear las bases de sistema). Quedó montado fuera de la ruta de datos (`/mnt/pendiente-resize`). Para persistir: **Live Resize desde el panel web** de Railway (no hay comando en MCP ni CLI) y devolver el mount path a `/var/opt/mssql`. Tras eso, re-correr `cargar_contratos.py` (idempotente, ~5 min).

### Pendientes de la migración (revisión con Contabilidad, NO bloquean frontend)
- [ ] **61 clientes con NIT placeholder `PEND-<hash>`** → Contabilidad debe poner el NIT real (cruce nombre→NIT falló por nombres distintos en CONTRATOS COE vs MATRIZ FACTURACION).
- [ ] **9 bloques del parser a revisión**: 4 sin nombre detectable, huecos (LINEA DIRECTA, OPENPAY), solapamiento (PROCARDIO), 1 "ya no se usa".
- [ ] **9 bloques saltados** por cliente+concepto repetido (ej. COLOMBIANA DE TRANSPLANTES ×3, DRUG STORE ×2): se cargó solo la primera tabla; revisar si las otras eran años/contratos distintos.
- [ ] **2 fallidos**: ECOPETROL (tabla no habilitada, sin años) y FUNDACION CARDIO INFANTIL (año descartado).

### Plan Etapa 2 — Digitalización del Maestro de Facturación (PLANIFICADO 2026-06-05)
**Objetivo:** sacar de la hoja `MATRIZ FACTURACION` el maestro de facturación por cliente (cómo se factura/contabiliza, NO cuánto), editable y vinculado a los contratos de Etapa 1.
**Límite de alcance:** SOLO el maestro (cuenta contable, unidad negocio, plazo, centro de costo, referencia, cód. iFactura/SIIGO, concepto, descripción, correo). Los montos/cascada de la hoja (cols Z+) son **Etapa 3**, no se tocan aquí.
- [x] 2. DDL tabla `lineas_facturacion` — `database/03_lineas_facturacion.sql` (índice único filtrado por contrato_item_id). (2026-06-05..09)
- [x] 3. Backend: módulo `facturacion` (CRUD `/lineas-facturacion` filtrable/paginado, auditado, roles). Build OK.
- [x] 4. Migración de MATRIZ FACTURACION — `migration/cargar_matriz.py`; **150 líneas cargadas**, 2 fallidas (celdas con URL en el NIT). Reporte en `migration/reporte_matriz.txt`.
- [x] 5. Frontend: pantalla "Maestro de facturación" (`FacturacionPage` + `LineaModal`), nav + ruta. Compila.
- [ ] 1/6. **Pendiente con Contabilidad**: confirmar campos + **reconciliación cliente↔contrato** (los NIT reales de MATRIZ no coinciden con los placeholder de CONTRATOS COE, así que el enlace `contrato_item_id` quedó sin poblar automáticamente).
- [ ] **Verificación end-to-end en vivo** — bloqueada: el contenedor `sqlserver-coe` está detenido por conflicto de puerto 1433 con `alertamiento-sql` (otro proyecto). Requiere liberar 1433 o levantar en otro puerto.

### Plan Etapa 3 — Ingesta de volúmenes + motor de cálculo (EN CURSO)
Decisión: **volúmenes también por Excel** por ahora (columna CANT de la MATRIZ; luego, ingesta desde BD de producción sin cambiar el motor).
- [x] **Motor de cálculo determinístico** (`backend/src/calculo/`): subtotal por modelo + cascada tributaria, `decimal.js`, redondeo 2 dec. **7 pruebas unitarias con valores reales, todas pasan** (2026-06-10).
- [x] **DDL `volumenes` + `pre_liquidados`** (`database/04_calculo.sql`) — pendiente de aplicar a la BD (bloqueado por puerto SQL).
- [x] **Ingesta de volúmenes desde Excel** (`cargar_volumenes.py` + `/volumenes/ingesta`): 139 cargados, 34 enlazados a tarifa. AXA=243936 (2026-06-10).
- [x] **Servicio de pre-liquidado** (`/pre-liquidados/calcular`, `GET`, `GET/:id`, `PATCH /:id/aprobar`): motor sobre volúmenes → guarda con desglose. Idempotente. Probado: 2026/1 → 10 calculados, 24 marcados SIN_ESCALON. Gate de aprobación implementado.
- [x] **Dashboard de aprobación (frontend)** (2026-06-10): pantalla "Pre-liquidado" con selector de periodo, botón calcular, resumen sobrio, tabla con selección, aprobar individual/en lote (gate humano) y modal de desglose (cascada completa). Verificado por UI.
- [x] **Panel de Alertas (2026-07-28)**: `backend/src/alertas/` (computado en vivo, sin tabla nueva, mismo patrón que Reconciliación) + `frontend/src/pages/AlertasPage.tsx` con contador en el menú lateral. Detecta: `desactualizado` (sin tarifa del año actual), `tarifa_incompleta` (le falta el mínimo/fijo del año), `nit_pendiente` (placeholder `PEND-`), `volumen_sin_enlazar`, `vencido`/`por_vencer` (`contrato.vigenciaHasta`, hoy casi siempre nula). Verificado contra Railway: APERGY/ZURICH (activos sin 2026) aparecen; los 27 clientes retirados NO aparecen. Fuera de alcance a propósito: sin estado de leído/descartado (se recalcula siempre en vivo), no valida correo de contacto (eso es Etapa 4).
- [x] **Contratos híbridos (2026-07-29)**: Contabilidad reportó que un contrato puede agrupar varias verticales/servicios cuyos volúmenes se SUMAN contra una sola tarifa (coexiste con el caso normal: 1 producto+concepto por item). Cambio de modelo: `contrato_items.producto_id/concepto_id` (1 par) → tabla puente `coe.contrato_item_conceptos` (N pares por item) — `backend/db/05_contratos_hibridos.sql`, aplicado en caliente sobre la BD viva sin recrear nada (`apply-schema.js` ahora tiene un gate independiente por script, no solo el centinela global de `coe.productos`; útil para todo script futuro). El motor de cálculo NO cambió (sigue recibiendo un solo `volumen`); `pre-liquidado.service.ts` agrupa los volúmenes por `contrato_item_id` y suma antes de llamar al motor; el aporte de cada servicio queda trazado en `desglose.volumenesOrigen`. Frontend: `ItemEditor` permite agregar N servicios por item. Verificado en Railway con un contrato de prueba (EMISION 600 + RECEPCION 500 = volumen 1.100 → tarifa del escalón correcto → subtotal exacto); datos de prueba dados de baja después. Sin caso real todavía — diseño genérico a la espera de que Contabilidad traiga un ejemplo concreto para validar contra datos reales.
- [ ] Validación IA de anomalías (hoy solo regla básica volumen-cero): volumen atípico vs histórico, tarifa vencida.
- [x] **Herramienta de reconciliación cliente↔contrato** (2026-06-10): backend (sugerencias por nombre + fusión transaccional/auditada que mueve tarifas y reengancha volúmenes) + pantalla `Reconciliación` (admin). Probada. **Falta que Contabilidad la use** para confirmar los ~55 cruces restantes.
- [ ] **Calidad de dato (restante):** cargar tarifas reales. El motor es correcto (probado); depende del dato.
  - **(2026-07-14) NO hay bug de escala.** Se inspeccionó el Excel: los precios son floats con decimales (AXA 2023 = 50.904) y el parser los preserva con `r4()`. La nota anterior ("50904 en vez de 50,904") no se pudo reproducir.
  - **(2026-07-14) El defecto real: 12 de 121 bloques tienen DOS columnas con el mismo año** en el encabezado (la columna nueva se copió sin actualizar el rótulo). El parser las metía en un dict por año → **la última ganaba en silencio**. En AXA, el año 2025 quedaba cargado con 61,5051 (que en realidad es 2026: ratio exacto 1,051 = IPC) en vez de 58,5205.
  - **Arreglado:** `columnas_precio()` conserva la PRIMERA columna de cada año y reporta la segunda en la sección "COLUMNAS DE ANIO AMBIGUO" del reporte. No se adivina el año: un precio inventado termina en una factura.
  - [ ] **Pendiente con Contabilidad:** confirmar los 12 bloques ambiguos (¿la 2ª columna es el año siguiente?). En 3 el incremento es uniforme (5,1% = IPC 2026 → casi seguro es 2026); en 9 los ratios varían por escalón y hay que mirarlos a mano. Lista completa en `migration/reporte_migracion.txt`.
  - **Consecuencia:** hoy NINGÚN bloque de esos 12 tiene tarifa 2026 → el pre-liquidado 2026 los marca SIN_ESCALON. Confirmar esto destraba el periodo actual.
- [ ] **Pendiente de diseño:** RteFte por cliente (3,5%/4%) y bases exactas de retención — confirmar con Contabilidad antes de producción.

### Etapa 4 — Emisión automática · ⏸️ EN PAUSA (decisión 2026-06-10)
**Bloqueada hasta confirmar con el equipo de producto si iFactura expone API de emisión** (endpoint, credenciales, formato) y la API de SIIGO. No se construye la maquinaria de emisión de facturas legales sobre una API no confirmada.
- Cuando se confirme: emisión en lote de lo APROBADO → iFactura (CUFE/DIAN) → estado facturado/rechazado → SIIGO; con **idempotencia obligatoria** (clave cliente+item+periodo) y el gate humano (ya existe). Patrón: adaptador conectable (simulación en dev, real cuando haya API).

---

## Decisiones tomadas
- Precio efectivo por año se ALMACENA (no se recalcula desde IPC), para auditabilidad.
- Cálculo escalonado NO es por tramos: el escalón selecciona la tarifa, se multiplica todo el volumen por ella.
- Producto es dimensión de primer nivel; tarifas cuelgan de contrato_item (contrato+producto+concepto).
- Cálculo determinístico, aprobación humana obligatoria, trazabilidad completa.
- **DDL APROBADO (2026-06-03).** Schema `coe`. FK: maestros RESTRICT, composición del contrato CASCADE. `anio` SMALLINT. Backend debe preferir borrado lógico (estado) sobre DELETE físico.

## Pendientes de diseño (Etapa 3, no bloquean Etapa 1)
- **RteFte varía por cliente (3,5% / 4%).** El cálculo de Etapa 3 necesitará la tasa de RteFte a nivel de cliente/contrato, NO solo como parámetro global. El modelo de tarifas actual no la cubre; al diseñar el motor habrá que añadir tasa/base de retención por cliente (o por contrato). `parametros_globales.RTEFTE` queda como valor por defecto/fallback.

## Bloqueos / esperando decisión
- [ ] Formato de los Excel de los otros ~33 productos.
- [ ] Base exacta de cada retención.
- [ ] ¿Algún producto con +2 conceptos?
- [ ] **¿iFactura tiene API de emisión? → BLOQUEA ETAPA 4** (confirmar con equipo de producto: endpoint, credenciales, formato). También API de SIIGO.
- [ ] Facturación de clientes sin bloque propio en COE.

## Entorno en el equipo de cflorez (2026-07-14) — ver `SETUP_LOCAL.md`
- Repo clonado, dependencias de backend y frontend instaladas, `openpyxl` instalado, `.env` de ambos creados. Backend y frontend **compilan**; las 7 pruebas del motor **pasan**.
- Los 2 Excel de origen están en la raíz (no se versionan). Los scripts de migración ya **resuelven el archivo por patrón** (`migration/fuente.py`), no por nombre exacto — el nombre real no traía el sufijo `(1)`.
- ⛔ **BLOQUEADO: no hay base de datos.** Docker Desktop no arranca porque **falta WSL2** y el usuario **no es administrador local**. IT debe correr `wsl --install --no-distribution` + reinicio. Sin BD no corre el backend, y los cargadores escriben vía la API, no directo a SQL.

## Entorno (Docker + dev)
- SQL Server en contenedor `sqlserver-coe` (1433, sa / Coe_Dev_2026*). BD `facturacion_coe` con esquema+semilla+migración cargada.
  - ⚠️ **CONFLICTO ACTUAL (2026-06-10):** `sqlserver-coe` está detenido y el puerto 1433 lo tiene `alertamiento-sql` (otro proyecto). Para levantar el nuestro: parar el otro (`docker stop alertamiento-sql`) y `docker start sqlserver-coe`, o recrear `sqlserver-coe` en otro puerto y ajustar `backend/.env`.
- Backend: `cd backend; node dist/main.js` (o `npm run start:dev`) → localhost:3000/api. Login admin/Admin123*.
- Frontend: `cd frontend; npm run dev` → localhost:5173. ⚠️ **5173 lo tomó otro proyecto ("Asistente IA")**; hoy se levantó en `--port 5180` y se añadió `http://localhost:5180` al `CORS_ORIGIN` del `.env`. `alertamiento-sql` sigue detenido (reiniciar con `docker start alertamiento-sql` cuando se necesite).
- Migración Etapa 1: `python migration/parse_contratos_coe.py` + `cargar_contratos.py`. Etapa 2: `python migration/cargar_matriz.py` (idempotentes).

## Próxima sesión: empezar por
Etapa 4 en pausa (esperando confirmación de la API de iFactura). Trabajo productivo disponible en **cerrar Etapa 3**:
1. **Calidad de dato** — cargar las tarifas reales (escala correcta, ej. AXA 50,904 no 50904) + reconciliación cliente↔contrato, para que TODOS los montos del pre-liquidado sean exactos. Es lo que le falta al pipeline para ser confiable.
2. **Validación de anomalías** — comparar volumen del mes contra histórico (atípico), tarifa vencida, cliente sin tarifa; mostrarlas como advertencias ámbar en el dashboard.
3. Transversal: verificación en vivo de Etapa 2 (Maestro de facturación) + reconciliación con Contabilidad.
