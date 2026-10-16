# Patrones de UI — detalle por pantalla

Estructuras sugeridas. No son obligatorias al pixel, pero respetan la filosofía: claridad para Contabilidad.

## 1. Listado de contratos/clientes

- Barra superior: buscador (NIT o razón social) + filtros (producto, modelo de cobro, estado) + botón primario "Crear contrato".
- Tabla densa pero cómoda: NIT · Razón social · Producto(s) · Modelo(s) · Vigencia · Estado (badge).
- Si un contrato tiene varios items/productos, mostrar un resumen ("iFactura, iSeguros") o un contador ("3 productos").
- Ordenable por columna. Paginación. Fila clicable → ficha.
- Estado vacío con mensaje y acción ("No hay contratos. Crear el primero").

## 2. Ficha de contrato (solo lectura)

Tipo expediente, escaneable de arriba a abajo:

- **Encabezado:** razón social, NIT, correo de contacto, vigencia, estado. Botón "Editar".
- **Items:** una tarjeta por cada (producto + concepto). Cada tarjeta muestra:
  - Producto · Concepto · Modelo de cobro (badge).
  - Si escalonado: tabla DE / HASTA / precio, con un selector de año arriba (default: año vigente). Cambiar el año recarga los precios de ese año.
  - Si mínimo garantizado: el valor mínimo por año + la tabla de escalones base.
  - Si fijo: el valor fijo por año.
- Separación visual clara entre items (tarjetas o secciones con título).

## 3. Formulario de contrato (crear/editar)

El más complejo. Asistente por pasos o secciones colapsables:

1. **Cliente:** NIT, razón social, correo, vigencia. (Autocompletar si el cliente ya existe.)
2. **Items:** botón "Agregar item". Por cada item:
   - Seleccionar producto → se cargan sus conceptos → seleccionar concepto.
   - Seleccionar modelo de cobro → la UI muestra el editor correspondiente:
     - escalonado → editor de escalones (patrón #4).
     - mínimo → editor de escalones + campo de mínimo por año.
     - fijo → campo de valor fijo por año.
   - Seleccionar año(s) a capturar.
3. **Guardar:** valida todo antes de enviar; resume cuántos items y tarifas se guardarán.

Validación en vivo, no solo al enviar. No permitir guardar un item sin tarifa válida.

## 4. Editor de escalones (componente reutilizable)

- Tabla editable inline: columnas DE · HASTA · Precio unitario, una fila por escalón.
- Botón "Agregar escalón" añade fila; ícono de papelera elimina.
- Selector de año visible y prominente (el versionado por año confunde — hacerlo explícito).
- **Validación en vivo:**
  - `desde <= hasta` por fila.
  - Sin solapamientos entre filas del mismo año.
  - Sin huecos (opcional, configurable: a veces se permiten).
  - Precio > 0.
- Los errores resaltan la(s) fila(s) culpable(s) y explican: "El escalón 3 (5001-7000) se solapa con el escalón 2 (1-7000)".

## 5. Gestión de productos y conceptos (admin)

- Lista simple de productos con su código y estado.
- Al entrar a un producto: sus conceptos facturables (alta/baja).
- Es prerrequisito de cargar tarifas; dejarlo accesible pero discreto (menú de administración).

## 6. Dashboard de pre-liquidado (etapas 3-4)

- Resumen del mes: total a facturar, # clientes, # con anomalías, estado del lote.
- Tabla de los ~700: cliente · producto · volumen · subtotal · total · estado (calculado/aprobado/facturado/rechazado) · indicador de anomalía.
- Click en fila → panel de **desglose** (volumen × tarifa → subtotal → cada impuesto → cartera).
- Anomalías como advertencia ámbar no bloqueante.
- Acción "Aprobar" individual y en lote, siempre con confirmación.
- Tras aprobar, el estado avanza; nada se emite sin pasar por aquí.

## Componentes transversales

- **Badge de estado:** verde (activo/aprobado), gris (inactivo), ámbar (anomalía/pendiente), rojo (rechazado).
- **Badge de modelo de cobro:** color sobrio por modelo, con la etiqueta legible.
- **Formato de moneda:** componente único `<Moneda valor={...} />` → `$ 12.417.318`, alineado a la derecha.
- **Diálogo de confirmación:** para toda acción irreversible.
- **Toast de feedback:** guardado, error, en español.
