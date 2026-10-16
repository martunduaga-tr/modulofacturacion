---
name: transfiriendo-frontend
description: Diseña y construye el frontend React del sistema de facturación de Transfiriendo. Úsala SIEMPRE que crees o modifiques cualquier pantalla, componente, tabla, formulario o vista del sistema (listado de contratos, ficha de tarifas, formularios de escalones, dashboard de pre-liquidado, gestión de productos). El objetivo es UI limpia, profesional y MUY entendible para el área de Contabilidad — bonita pero sobria, nunca recargada. Si el usuario pide "que el front sea lindo", "una pantalla para", "un formulario de", "una tabla de", o menciona la interfaz, esta skill aplica.
---

# Frontend del sistema de facturación — Transfiriendo

Construye el frontend React. La audiencia es el área de **Contabilidad**: personas que hoy trabajan en Excel y necesitan una herramienta más confiable, no más vistosa. La regla de oro: **claridad operacional primero, estética al servicio de la tarea.** Bonito, pero que cualquier contador entienda en 10 segundos qué está viendo y qué puede hacer.

Antes de construir cualquier pantalla, consulta también la skill `facturacion-domain` para no inventar reglas de negocio.

## Filosofía de diseño

Esto NO es una landing ni un producto de marketing. Es una herramienta de trabajo diario. Por eso:

- **Sobriedad profesional.** Nada de gradientes morados, animaciones llamativas, ni "AI slop". Un look de software financiero serio: limpio, espacioso, legible.
- **La densidad de datos es una virtud, no un defecto** — pero organizada. Contabilidad maneja cientos de filas; la tabla debe ser cómoda de escanear, con jerarquía visual clara.
- **Cada acción evidente.** Botones con etiquetas claras en español ("Crear contrato", "Agregar escalón", "Guardar tarifa"), no íconos solos ambiguos.
- **Estados visibles.** Cargando, guardado, error de validación, sin datos — siempre con feedback explícito.
- **Errores que enseñan.** Si un escalón se solapa, el mensaje dice exactamente cuál y cómo arreglarlo.

## Stack y convenciones

- React + TypeScript.
- Componentes funcionales con hooks.
- Estado de servidor con React Query (TanStack Query) — caché, reintentos, estados de carga gratis.
- Formularios con React Hook Form + validación (Zod), porque los formularios de tarifas son complejos.
- Tablas con TanStack Table para ordenar/filtrar/paginar cientos de filas.
- Todo en **español** (etiquetas, mensajes, validaciones, fechas y montos en formato colombiano).

## Sistema visual

Paleta sobria de software financiero. Define todo en variables CSS / tokens, no hardcodees colores.

```
--color-primary      #1D6E56   (verde Transfiriendo, sobrio — acciones primarias)
--color-primary-soft #E1F5EE   (fondos de acento, badges)
--color-text         #1F2421   (texto principal, casi negro)
--color-text-muted   #5F6360   (secundario, ayudas)
--color-surface      #FFFFFF   (tarjetas, tablas)
--color-bg           #F6F7F5   (fondo de página)
--color-border       #E2E5E1
--color-danger       #A32D2D   (errores, validación)
--color-warning      #854F0B   (anomalías, alertas suaves)
--color-success      #1D9E75   (guardado, aprobado)
```

- **Tipografía:** una sans legible y neutra (ej. system-ui o una como Inter SÓLO porque aquí prima la legibilidad sobre la distinción — este es el caso donde lo genérico es correcto). Tamaños: 14px base, 13px en tablas densas, 18-22px en títulos. Pesos: 400 y 500. Nunca todo en mayúsculas salvo etiquetas cortas tipo badge.
- **Montos:** siempre formato colombiano `$ 12.417.318` (punto de miles, sin decimales para pesos enteros), alineados a la derecha en columnas.
- **Fechas:** `dd/mm/aaaa`.
- **Bordes redondeados suaves** (6-8px), sombras muy sutiles, mucho espacio en blanco. Plano y limpio, sin efectos.

## Patrones de pantalla

Ver `references/patrones-ui.md` para el detalle de cada uno. Los principales:

1. **Listado de contratos/clientes** — tabla con búsqueda, filtro por producto y modelo de cobro, badge de estado. Fila clicable → ficha.
2. **Ficha de contrato** — vista de solo lectura tipo "expediente": datos del cliente arriba, luego un bloque por cada item (producto + concepto) mostrando su tabla de tarifa por año. Clara separación visual entre items.
3. **Formulario de contrato/tarifa** — el más complejo. Asistente por pasos: cliente → agregar items → por item, según modelo de cobro, capturar escalones / mínimo / fijo → años. Validación en vivo de solapamientos de escalones.
4. **Editor de escalones** — tabla editable inline (filas DE/HASTA/precio), con botón "agregar escalón" y validación que resalta solapamientos o huecos.
5. **Gestión de productos y conceptos** — pantalla simple de administrador (alta de los ~34 productos y sus conceptos).
6. **Dashboard de pre-liquidado** (etapas posteriores) — los montos calculados por cliente con su estado (calculado/aprobado/facturado) y anomalías marcadas; acción de aprobar.

## Reglas de UX específicas del dominio

- En el editor de escalones, mostrar SIEMPRE de qué año es el precio que se edita; el versionado por año es la fuente de confusión #1.
- Al mostrar un monto calculado, ofrecer ver el **desglose** (volumen × tarifa → subtotal → impuestos → cartera). La trazabilidad debe ser visible, no solo almacenada.
- Las anomalías detectadas por IA se muestran como advertencia ámbar no bloqueante ("este cliente facturó 40% menos que su promedio"), nunca como error rojo — son señales para revisar, no fallos.
- Nada se aprueba/emite sin confirmación explícita. Las acciones irreversibles llevan diálogo de confirmación.

## Accesibilidad y robustez

- Contraste suficiente (texto sobre fondo cumple WCAG AA).
- Navegable por teclado (Contabilidad usa mucho tabulador en formularios).
- Estados de carga con skeletons, no spinners a pantalla completa.
- Manejo de errores de API con mensajes en español accionables.

## Referencias

- `references/patrones-ui.md` — detalle de cada patrón de pantalla con estructura sugerida.
