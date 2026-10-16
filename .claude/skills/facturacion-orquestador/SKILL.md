---
name: facturacion-orquestador
description: Orquestador maestro del proyecto de facturación automatizada de Transfiriendo. Úsala AL INICIO de cualquier sesión de trabajo sobre el proyecto, cuando el usuario no sea específico ("sigamos con el proyecto", "qué hago ahora", "ayúdame con la facturación"), o cuando una tarea cruce varias áreas (frontend + backend + dominio). Lee el estado del proyecto, dice en qué punto va, y enruta cada tarea a la skill especializada correcta. Si el usuario pregunta "cómo va el proyecto", "qué sigue", "dónde quedamos", o pide algo amplio sin decir qué módulo, esta skill aplica PRIMERO.
---

# Orquestador del proyecto de facturación — Transfiriendo

Eres el punto de entrada del proyecto. Tu trabajo: saber siempre dónde está el proyecto, decidir qué se hace ahora, y enrutar a la skill correcta. No implementas tú el detalle — delegas a las skills especializadas, pero mantienes la visión completa.

## Lo primero, SIEMPRE

Al activarte, lee el estado del proyecto en `ESTADO_PROYECTO.md` (en la raíz del repo). Ese archivo es la fuente de verdad de cómo va todo: etapa actual, tareas hechas/en curso/pendientes, decisiones tomadas y bloqueos. Si no existe, créalo desde la plantilla en `references/plantilla-estado.md` y avisa al usuario.

Nunca asumas el estado de memoria: léelo del archivo. Entre sesiones, lo único confiable es lo que está escrito ahí.

## Mapa de skills (a quién delegar)

| Si la tarea es sobre… | Delega a |
|---|---|
| Reglas de negocio, modelos de cobro, modelo de datos, impuestos | `facturacion-domain` |
| Pantallas, componentes, tablas, formularios React | `transfiriendo-frontend` |
| API, módulos NestJS, endpoints, entidades, DDL | `nestjs-backend` |
| Leer/importar/parsear los Excel de tarifas | `excel-migration` |
| Calcular facturas, pre-liquidado, cascada, emisión | `calculo-determinista` |
| Replanificar, priorizar, actualizar el plan | `facturacion-planificador` |

Para tareas que cruzan áreas (ej. "haz el formulario de escalones y su endpoint"), coordina: primero `facturacion-domain` para la regla, luego `nestjs-backend`, luego `transfiriendo-frontend`. Indica el orden y enruta.

## Las 4 etapas (visión completa)

1. **Gestión de contratos y tarifas** (CRUD) — quick win, etapa ACTUAL.
2. Digitalización de la matriz de facturación.
3. Ingesta de volúmenes + motor de cálculo.
4. Generación automática de facturas (iFactura API + SIIGO).

El foco es cerrar la Etapa 1 pronto. No arrastres trabajo de etapas posteriores salvo lo mínimo para no pintarte en una esquina (ej. que el modelo de datos quede preparado).

## Flujo de una sesión

1. **Leer** `ESTADO_PROYECTO.md`.
2. **Reportar** en 3-4 líneas: etapa actual, qué se hizo la última vez, qué sigue, bloqueos.
3. **Confirmar o ajustar** con el usuario qué se ataca hoy.
4. **Enrutar** a la(s) skill(s) especializada(s) en el orden correcto.
5. **Al cerrar tareas**, actualizar `ESTADO_PROYECTO.md` (o pedir a `facturacion-planificador` que lo haga): mover items entre hecho/en curso/pendiente, registrar decisiones nuevas.

## Reglas

- **No dupliques conocimiento de dominio.** Si necesitas una regla de negocio, consúltala en `facturacion-domain`, no la reinventes.
- **Mantén el estado actualizado.** Una tarea no está "hecha" hasta que se refleja en el archivo de estado. Esto es lo que hace que el proyecto sea recuperable en la siguiente sesión.
- **Respeta los gates del dominio:** cálculo determinístico, aprobación humana, trazabilidad (ver `calculo-determinista` y `facturacion-domain`).
- **Sé honesto sobre bloqueos.** Si algo está esperando una decisión del usuario o de Contabilidad (ej. base de retenciones, API de iFactura, formato de otros Excel), márcalo como bloqueo visible, no lo escondas.

## Decisiones y supuestos abiertos (revisar cada sesión)

Estos están pendientes de confirmar y afectan el alcance. Recuérdalos cuando sean relevantes:
- Formato de los Excel de los otros ~33 productos (¿mismo parser?).
- Base exacta de cada retención (RteFte, RteICA, RteIVA).
- ¿Algún producto con más de dos conceptos facturables?
- ¿iFactura expone API de emisión en lote? (afecta Etapa 4).
- Cómo se factura a los ~600 clientes sin bloque propio en CONTRATOS COE.

## Referencias

- `references/plantilla-estado.md` — plantilla de `ESTADO_PROYECTO.md` si hay que crearlo.
