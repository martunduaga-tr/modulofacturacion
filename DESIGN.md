# Design

Sistema visual del Sistema de Facturación COE. Estrategia de color: **restrained**
(neutrales + un primario + un acento cálido, todos con disciplina). La calidez se
transmite por tipografía humanista, espaciado, radios suaves y copy — no por color
de fondo ni saturación. Fondo blanco puro. Todo en OKLCH.

## Theme

- **Mood:** "escritorio de contabilidad bien iluminado, papel limpio y tinta azul de confianza — ordenado, humano, sin estridencia".
- **Register:** product (app interna, desktop-first, responsive a portátil).
- **Light mode** como base (jornadas largas con luz de oficina). Dark mode no es prioridad de Etapa 1.
- Estrategia de color: **restrained** — primario cobalto + acento ámbar usado con medida + neutrales casi puros.

## Color

Tokens OKLCH. Contraste verificado para AA (texto ≥ 4.5:1).

```css
:root {
  /* Superficies — blanco puro + neutrales con un hilo de la hue de marca (frío) */
  --bg:              oklch(1 0 0);            /* blanco puro, sin calidez oculta */
  --surface:         oklch(0.985 0.003 240);  /* tarjetas, panes */
  --surface-sunken:  oklch(0.965 0.005 240);  /* encabezado de tabla, zonas hundidas */
  --border:          oklch(0.908 0.006 240);  /* hairlines */
  --border-strong:   oklch(0.85 0.008 240);

  /* Tinta — fría-neutral, alto contraste */
  --ink:             oklch(0.27 0.02 245);    /* texto principal (~13:1 sobre bg) */
  --ink-muted:       oklch(0.46 0.02 245);    /* secundario (~5.4:1, AA ok) */
  --ink-subtle:      oklch(0.58 0.015 245);   /* terciario: solo texto grande/labels */

  /* Primario — cobalto de confianza (hue 238, dentro de ±10° del seed) */
  --primary:         oklch(0.48 0.12 238);    /* botones, links, foco, activo */
  --primary-hover:   oklch(0.42 0.12 238);
  --primary-weak:    oklch(0.962 0.022 238);  /* wash de fila activa / selección */
  --on-primary:      oklch(1 0 0);            /* texto sobre primario (~5:1) */

  /* Acento cálido — ámbar miel. USO MEDIDO: realces, año vigente, vacíos amables */
  --accent:          oklch(0.74 0.12 72);
  --accent-weak:     oklch(0.965 0.035 72);

  /* Semánticos de estado (badges: activo/inactivo/anomalía/rechazado) */
  --ok:        oklch(0.55 0.11 150);  --ok-weak:     oklch(0.955 0.03 150);
  --warn:      oklch(0.70 0.12 72);   --warn-weak:   oklch(0.962 0.04 72);
  --danger:    oklch(0.55 0.16 25);   --danger-weak: oklch(0.955 0.035 25);
  --neutral:   oklch(0.62 0.01 245);  --neutral-weak:oklch(0.955 0.004 245);

  --focus-ring: oklch(0.62 0.13 238 / 0.45);
}
```

Reglas: gris claro sobre fondo tintado está prohibido (usar `--ink-muted` mínimo).
El acento ámbar nunca compite con el primario; aparece en puntos, no en bloques.

## Typography

Dos familias (+ mono técnica). Jerarquía por **escala y peso**, no por color.

- **UI / texto / títulos:** `"Figtree"` (humanista, cálida, variable) — carga la cercanía.
- **Cifras tabulares (montos, escalones):** la misma Figtree con `font-variant-numeric: tabular-nums` para que las columnas de dinero alineen.
- **Strings técnicos (NIT, CUFE, IDs):** `"IBM Plex Mono"`.
- Fallback: `system-ui, -apple-system, "Segoe UI", sans-serif`.

```css
--font-sans: "Figtree", system-ui, -apple-system, "Segoe UI", sans-serif;
--font-mono: "IBM Plex Mono", ui-monospace, "Cascadia Code", monospace;

/* Escala ~1.22, base 15px (cómodo para jornadas largas) */
--text-xs: 0.80rem;   /* 12.8 — labels, badges */
--text-sm: 0.88rem;   /* 14   — meta, ayudas */
--text-base: 0.9375rem;/* 15  — cuerpo */
--text-lg: 1.125rem;  /* 18   — subtítulos */
--text-xl: 1.375rem;  /* 22   — título de sección */
--text-2xl: 1.6875rem;/* 27   — título de página */

--leading-body: 1.5;
--leading-tight: 1.2;   /* títulos: text-wrap: balance */
```

Pesos: 400 cuerpo, 500 énfasis/labels, 600 títulos. Sin ALL CAPS en cuerpo
(uppercase solo en badges/labels ≤ 4 palabras). Línea de cuerpo ≤ 70ch.

## Spacing & Layout

```css
/* Escala base 4px */
--space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
--space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;

/* Radios suaves = calidez sin decoración */
--radius-sm: 6px;   /* inputs, badges */
--radius-md: 8px;   /* botones, controles */
--radius-lg: 12px;  /* tarjetas, paneles */

/* Elevación mínima y suave (nada de sombras llamativas) */
--shadow-sm: 0 1px 2px oklch(0.27 0.02 245 / 0.06);
--shadow-md: 0 4px 12px oklch(0.27 0.02 245 / 0.08);

/* z-index semántico */
--z-dropdown: 10; --z-sticky: 20; --z-backdrop: 30; --z-modal: 40; --z-toast: 50; --z-tooltip: 60;
```

- **App shell:** sidebar izquierda (Contratos · Productos · Parámetros · Auditoría · Usuarios) + barra superior (búsqueda global, usuario/rol). Contenido con ancho cómodo; tablas a todo el ancho, formularios acotados (~720px).
- Densidad **cómoda** (ni apretada tipo Excel, ni excesivamente aireada). Filas de tabla ~44px.
- Grids responsivos sin breakpoints: `repeat(auto-fit, minmax(280px, 1fr))`. Flex 1D, Grid 2D.

## Components

- **Tabla de datos:** encabezado `--surface-sunken`, hairlines `--border`, hover de fila `--primary-weak`, fila clicable. Cifras a la derecha con tabular-nums. Ordenable, paginada, con estado vacío con acción.
- **Badge de estado:** relleno `*-weak` + texto del color pleno. Verde activo/aprobado · gris inactivo · ámbar anomalía/pendiente · rojo rechazado.
- **Badge de modelo de cobro:** sobrio, etiqueta legible (escalonado / mínimo / fijo).
- **`<Moneda>`:** formato `$ 12.417.318` (separador de miles con punto, es-CO), tabular-nums, alineado a la derecha.
- **Editor de escalones:** tabla editable inline (DE · HASTA · Precio), selector de año prominente, validación en vivo que resalta la fila culpable y explica el error.
- **Diálogo de confirmación:** para toda acción irreversible.
- **Toast:** feedback en español (guardado/error), esquina, auto-dismiss.
- **Inputs:** borde `--border-strong`, foco con `--focus-ring` (anillo, no glow), label arriba, ayuda/errores debajo en `--ink-muted` / `--danger`.
- **Botones:** primario (cobalto, texto blanco), secundario (borde + tinta), fantasma (solo texto). Label = verbo + objeto ("Guardar cambios", "Crear contrato").

## Motion

- Sutil y con propósito. Transiciones 150–200ms, `ease-out` exponencial (quart). Sin bounce/elastic.
- Hover/foco/selección: cambios de color/elevación instantáneos o muy rápidos.
- Entradas de menús/diálogos: fade + leve translate (8px). Listas: stagger ligero solo donde aporte.
- `@media (prefers-reduced-motion: reduce)`: crossfade o instantáneo. Obligatorio.

## Anti-patterns (recordatorio)

Prohibido: side-stripe borders, gradient text, glassmorphism decorativo, hero-metric
template, grids de tarjetas idénticas, eyebrows en mayúsculas sobre cada sección,
exceso de color. Si una pantalla se parece a un Excel recargado, rehacer la jerarquía.
