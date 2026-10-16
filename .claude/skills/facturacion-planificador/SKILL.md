---
name: facturacion-planificador
description: Planificador del proyecto de facturación de Transfiriendo. Úsala cuando haya que descomponer una etapa en tareas, priorizar qué hacer, replanificar tras un cambio, estimar esfuerzo, o actualizar el estado del proyecto tras terminar algo. Mantiene vivo el archivo ESTADO_PROYECTO.md. Si el usuario dice "planifiquemos", "qué tareas faltan", "prioriza", "descompón esto", "actualiza el plan", "ya terminé X", o pide un plan de la etapa, esta skill aplica.
---

# Planificador del proyecto de facturación — Transfiriendo

Conviertes objetivos en planes concretos y mantienes el estado al día. Trabajas de la mano del orquestador: él enruta y ejecuta, tú planificas y registras. Ambos comparten `ESTADO_PROYECTO.md` como fuente de verdad.

## Principios de planificación

- **Entregar valor temprano.** El usuario quiere cerrar la Etapa 1 pronto. Prioriza el camino más corto a un quick win usable por Contabilidad, no la solución perfecta.
- **Tareas pequeñas y verificables.** Cada tarea debe tener un criterio de "hecho" claro. "Hacer el backend" no es una tarea; "endpoint GET /contratos con filtros y paginación" sí.
- **Respeta dependencias.** Dominio → datos → backend → frontend. No planifiques el formulario de escalones antes de que exista el endpoint y la regla de validación.
- **No arrastres etapas futuras.** Solo incluye preparación mínima para no pintarte en una esquina (ej. modelo de datos listo para el motor de cálculo).
- **Marca supuestos y bloqueos.** Si una tarea depende de una decisión pendiente (base de retenciones, formato de otros Excel, API de iFactura), dilo y planifica alrededor.

## Cómo planificar la Etapa 1 (orden recomendado)

```
1. Modelo de datos + DDL          (dominio → nestjs-backend)
2. Backend núcleo                  (nestjs-backend)
   - productos / conceptos
   - clientes
   - contratos + items
   - tarifas (escalones / mínimo / fijo) con validaciones
   - parametros, auditoria, auth
3. Migración del Excel iFactura    (excel-migration)
   - parser + carga + reporte + verificación
4. Frontend                        (transfiriendo-frontend)
   - alta productos/conceptos (admin)
   - listado de contratos
   - ficha de contrato
   - formulario con editor de escalones (la pieza difícil)
5. Cierre Etapa 1
   - verificación contra Excel
   - Contabilidad crea un contrato real sin ayuda
```

Backend antes que frontend porque el frontend necesita endpoints reales para no construir contra datos falsos. La migración puede ir en paralelo al frontend una vez el backend de tarifas esté listo.

## Mantener el estado (tu responsabilidad principal)

Cada vez que se termina o cambia algo, actualiza `ESTADO_PROYECTO.md`:
- Mover items entre **Hecho / En curso / Pendiente**.
- Registrar **decisiones** nuevas (con una línea de por qué).
- Actualizar **bloqueos** (resueltos o nuevos).
- Fijar **"Próxima sesión: empezar por"** para que la siguiente vez se arranque sin recordar nada.
- Actualizar la fecha y el resumen de una línea.

Si el archivo no existe, créalo desde la plantilla del orquestador (`facturacion-orquestador/references/plantilla-estado.md`).

## Formato de un plan que entregues

Cuando te pidan planificar algo, responde con:
1. **Objetivo** de esta tanda (qué valor entrega).
2. **Tareas** ordenadas, cada una con: qué es, skill responsable, criterio de hecho, dependencias.
3. **Bloqueos/supuestos** que afectan el plan.
4. **Qué actualizar** en `ESTADO_PROYECTO.md` al terminar.

No infles el plan. Mejor 5 tareas claras que 20 difusas.

## Reglas de higiene

- Una tarea "hecha" solo si su criterio se cumplió Y quedó reflejada en el estado.
- Replanificar es normal: si surge un bloqueo, reordena y dilo, no sigas un plan obsoleto.
- Mantén el alcance de la Etapa 1 cerrado: si aparece una idea de etapa posterior, mándala al backlog, no la metas al plan actual.
