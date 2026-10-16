# Casos borde del modelo de facturación — para revisión con Contabilidad

> Preparado a partir de los 4 archivos de contratos por unidad de negocio (`Contratos_FACTURA_estructurado.xlsx`, `Contratos_RECAUDO_estructurado.xlsx`, `Contratos_SALUD_estructurado.xlsx`, `Contratos_SEGUROS_estructurado.xlsx`) y del maestro de clientes (`DATACLIENTES.xlsx`).
> Fecha: 2026-08-27.

## Propósito

El sistema de facturación automatizada (COE) hoy soporta **3 modelos de cobro**:

1. **Volumen escalonado**: el volumen del mes cae en un escalón (rango de-hasta), y se cobra `volumen × tarifa del escalón`.
2. **Mínimo garantizado**: igual al anterior, pero si el resultado queda por debajo de un piso fijo, se cobra el piso.
3. **Fijo mensual**: un monto fijo, no depende del volumen.

Al revisar los 4 archivos de contratos reales encontramos **casos que no encajan limpiamente en estos 3 modelos**, o que sí encajan pero con una estructura distinta a la que el sistema espera hoy. Antes de programar el ajuste necesitamos que Contabilidad confirme, caso por caso, **cómo opera realmente cada uno** — porque una interpretación equivocada produce una factura con el monto incorrecto.

**Cómo usar este documento:** cada caso tiene un ID (A1, B2, etc.) y una pregunta puntual. Por favor responde directamente debajo de cada pregunta, o referenciando el ID en el medio que prefieran (correo, reunión, comentarios sobre este mismo archivo).

---

## A. Modelo "Mínimo garantizado" — la estructura real no calza con el sistema

### A1. Patrón general (53 de los ~155 grupos cliente+servicio+año revisados)

En el Excel, la banda de **menor volumen** aparece marcada como `MINIMO GARANTIZADO` con un monto **plano** (no multiplicado por volumen), y las bandas de mayor volumen aparecen como `ESCALA` con precio por unidad.

**Ejemplo real — ALKA MOTOR, servicio EMISION Y RECEPCION, año 2026:**

| Desde | Hasta | Modelo | Tarifa |
|---|---|---|---|
| 1 | 1.000 | MINIMO GARANTIZADO | $251.359 |
| 1.001 | 2.500 | ESCALA | $236,45 /unidad |
| 2.501 | 3.000 | ESCALA | $217,32 /unidad |
| 3.001 | 5.000 | ESCALA | $203,65 /unidad |

**Otro ejemplo — SANTA FE, servicio CUENTA MEDICA, año 2026:**

| Desde | Hasta | Modelo | Tarifa |
|---|---|---|---|
| 1 | 6.000 | MINIMO GARANTIZADO | $7.128.368 |
| 6.001 | 30.000 | ESCALA | $1.188 /unidad |
| 30.001 | 50.000 | ESCALA | $1.108 /unidad |
| 50.001 | en adelante | ESCALA | $1.029 /unidad |

**El problema:** el sistema hoy calcula el mínimo garantizado así: toma el volumen real, busca el escalón que le corresponde, calcula `volumen × tarifa de ese escalón`, y compara ese resultado contra **un único** valor mínimo del año. No existe la idea de "una banda entera cuyo cobro es un monto plano".

- Si cargamos la banda baja como un escalón más (precio unitario = $251.359), un cliente con 500 unidades facturaría `500 × 251.359 = $125.679.500` — un error monstruoso.
- Si en cambio guardamos $251.359 solo como "el mínimo" y no como escalón, un cliente con 500 unidades no tiene ningún escalón que lo cubra y el sistema no podría calcular nada para él.

#### ✅ Respuesta confirmada por Contabilidad (2026-08-31)

No es "banda plana + escalonado normal aparte". Es una **franquicia**: el mínimo garantizado cubre siempre las primeras N unidades (el tope de la banda baja) por el monto plano, y el **excedente** sobre ese tope se cobra a la tarifa unitaria del escalón donde cae el **volumen total del mes** (no una tarifa propia del tramo del excedente).

**Fórmula:**

```
si volumen_total ≤ tope_banda_mínima:
    factura = monto_plano_mínimo_garantizado

si volumen_total > tope_banda_mínima:
    excedente = volumen_total − tope_banda_mínima
    tarifa_marginal = tarifa del escalón (ESCALA) donde cae volumen_total
    factura = monto_plano_mínimo_garantizado + (excedente × tarifa_marginal)
```

**Ejemplo real — ALKA MOTOR, 3.500 transacciones en el mes:**

| Paso | Cálculo | Resultado |
|---|---|---|
| Mínimo garantizado (banda 1–1.000) | monto plano | $251.359 |
| Excedente | 3.500 − 1.000 | 2.500 unidades |
| Tarifa marginal | escalón donde cae 3.500 (banda 3.001–5.000) | $203,65/unidad |
| Cobro por excedente | 2.500 × $203,65 | $509.125 |
| **Factura total** | $251.359 + $509.125 | **$760.484** |

Esta regla reemplaza la pregunta original de A1 y debe usarse también para interpretar A2, A3 y A4 más abajo, salvo que se indique lo contrario para cada caso puntual.

---

### A2. PAN AMERICAN LIFE (PALIG) — 3 mínimos distintos para el mismo servicio

**Archivo:** RECAUDO. Servicio: POLIZA DIGITAL, año 2026.

| Desde | Hasta | Modelo | Tarifa |
|---|---|---|---|
| 1 | 3.000 | MINIMO GARANTIZADO | $3.349.664 |
| 1 | 3.000 | MINIMO GARANTIZADO | $3.806.437 |
| 1 | 3.000 | MINIMO GARANTIZADO | $4.620.529 |
| 3.001 | en adelante | ESCALA | $1.104 /unidad |

El archivo trae una nota: son 3 "fases" (FASE 1, FASE 2, FASE 3) del mismo contrato, y la fase 3 sería la vigente a julio 2026.

#### ✅ Respuesta confirmada por Contabilidad (2026-08-31)

No eran 3 fases simultáneas — eran 3 **actualizaciones sucesivas de tarifa** del mismo contrato. El valor real vigente es un único mínimo garantizado de **$4.620.529** (banda 1–3.000). Las otras dos cifras son historial sin efecto en el cálculo.

Se revisaron los 4 archivos de contratos completos (FACTURA, RECAUDO, SALUD, SEGUROS) buscando otros grupos cliente+servicio con más de una fila "MINIMO GARANTIZADO" — **no se encontró ningún otro caso de este tipo**. PALIG fue el único, y el archivo fuente (`Contratos_RECAUDO_estructurado.xlsx`) ya está consolidado con el valor correcto.

---

### A3. EQUIDAD VIDA — mínimo garantizado sin ninguna tarifa por volumen

**Archivo:** SALUD. Servicio: CUENTAS MEDICAS (ADMINISTRADOR CM), año 2026.

| Desde | Hasta | Modelo | Tarifa |
|---|---|---|---|
| 1 | en adelante | MINIMO GARANTIZADO | $2.985.260 |

Es la única fila del grupo — no hay ninguna fila de escala con la que comparar.

**Pregunta:** ¿este servicio en realidad es un **cobro fijo mensual** de $2.985.260 (nunca se compara contra volumen) y quedó mal etiquetado como "mínimo garantizado"? Si confirman esto, lo tratamos como monto fijo, que es más simple.

---

### A4. UROCADIZ — mínimo garantizado combinado con el modelo "BOLSA" (ver sección B)

**Archivo:** FACTURA. Servicio: RECEPCION, año 2026.

| Desde | Hasta | Modelo | Tarifa |
|---|---|---|---|
| 1 | 4.000 | MINIMO GARANTIZADO | $1.476.489 |
| 4.001 | 20.000 | BOLSA | $223,53 /unidad |
| 20.001 | 45.000 | BOLSA | $193,32 /unidad |
| 45.001 | 60.000 | BOLSA | $105,12 /unidad |
| 60.001 | 100.000 | BOLSA | $99,08 /unidad |
| 100.001 | en adelante | BOLSA | $85,79 /unidad |

**Pregunta:** las filas "BOLSA" de este cliente parecen precio por unidad normal (no un monto plano por banda, a diferencia de B1 abajo). ¿Confirman que aquí funciona igual que un escalonado normal, con el mínimo de $1.476.489 aplicando solo por debajo de 4.000 unidades?

#### ✅ Respuesta confirmada por Contabilidad (2026-08-31)

Confirmado: UROCADIZ es un escalonado normal (mínimo garantizado + ESCALA por unidad, según la fórmula de A1), no un paquete tipo BOLSA. La etiqueta "BOLSA" fue un error de captura. De hecho, en el archivo fuente actual (`Contratos_FACTURA_estructurado.xlsx`) UROCADIZ ya aparece correctamente etiquetado como `ESCALA`.

Se revisaron los 4 archivos completos buscando otros casos de "BOLSA" mal etiquetado (que en realidad fueran escala normal). **No hay más casos de este tipo.** El modelo `BOLSA` tal cual etiquetado en el origen solo aparece en 2 clientes, ambos en el archivo FACTURA, y ambos sí son paquete plano genuino (ver B1): **FUNDACION SALUD MIA EPS** y **GESENCRO Y CAC SANTA BARBARA**.

---

## B. Modelo "BOLSA" — no existe en el sistema hoy, y parece tener dos comportamientos distintos

### B1. FUNDACION SALUD MIA EPS y GESENCRO Y CAC SANTA BARBARA — ¿paquete plano por rango?

**Archivo:** FACTURA, año 2026. Ejemplo — FUNDACION SALUD MIA EPS (24 bandas en total, se muestran las primeras):

| Desde | Hasta | Tarifa (BOLSA) |
|---|---|---|
| 1 | 2.000 | $464.705,12 |
| 2.001 | 2.500 | $563.796,65 |
| 2.501 | 3.000 | $656.054,28 |
| 3.001 | 3.500 | $789.315,31 |
| ... | ... | ... |
| 27.501 | en adelante | $2.870.237,49 |

**Ejemplo — GESENCRO Y CAC SANTA BARBARA:**

| Desde | Hasta | Tarifa (BOLSA) |
|---|---|---|
| 1 | 2.000 | $464.705,12 |
| 2.001 | 5.000 | $1.093.423,81 |
| 5.001 | 10.000 | $2.050.169,64 |
| 10.001 | 20.000 | $3.826.983,33 |
| 20.001 | 30.000 | $5.330.441,06 |
| 30.001 | 40.000 | $6.560.542,84 |
| 40.001 | 50.000 | $7.517.288,68 |
| 50.001 | en adelante | $8.610.712,48 |

La diferencia entre bandas es demasiado pequeña para tratarse de "volumen × precio unitario" — por ejemplo, pasar de 2.000 a 2.500 unidades solo sube el cobro en ~$99.000 en total, no en 500× un precio unitario razonable.

**Pregunta:** ¿confirman que esto es un **paquete/bolsa mensual**: se paga el monto total indicado según en qué rango cae el volumen total del mes, sin prorratear por unidad dentro de ese rango? Esto sería un 4° modelo de cobro que hoy no existe en el sistema (distinto del mínimo garantizado, porque aquí nunca se compara contra volumen × tarifa — se elige directamente el monto de la banda).

#### ✅ Respuesta confirmada por Contabilidad (2026-08-31)

Confirmado: **BOLSA es un 4° modelo de cobro**, genuinamente distinto de ESCALA y de MÍNIMO GARANTIZADO. Regla: se cobra el monto plano de la banda en la que cae el volumen total del mes — sin multiplicar por unidades, sin prorrateo. El mismo cobro aplica para cualquier volumen dentro de la banda.

**Fórmula:**

```
factura = tarifa_plana del rango (Desde–Hasta) donde cae volumen_total
```

**Ejemplo real — FUNDACION SALUD MIA EPS:**
- 7.800 transacciones → cae en banda 7.501–8.000 → factura = **$1.312.108,57**
- 7.900 transacciones → misma banda → factura = **$1.312.108,57** (idéntico, sin cambio)
- 8.200 transacciones → cambia a banda 8.001–8.500 → factura = **$1.336.027,21**

**Nota sobre los clientes — "GESENCRO Y CAC SANTA BARBARA" son en realidad 2 empresas distintas**, no una sola. En el archivo de contratos aparecen como un solo registro combinado (sin NIT), pero comparten exactamente la misma tabla de tarifas BOLSA. Ya se creó el registro independiente de una de ellas — **CLINICA DE ALTA COMPLEJIDAD SANTA BARBARA S.A.S.** (NIT 901108368-9) — con las mismas tarifas. Verificado contra el maestro de clientes (`DATACLIENTES.xlsx`): **GESENCRO no tiene todavía registro propio** — falta crearlo (mismo NIT/DV pendiente por confirmar) para poder facturarle de forma independiente con esta misma tabla.

### B2. SAN CARLOS — modelo "MANTENIMIENTO" combinado con escala normal

**Archivo:** FACTURA, año 2026.

| Desde | Hasta | Modelo | Tarifa |
|---|---|---|---|
| 1 | 2.000 | ESCALA | $920 /unidad |
| 2.001 | 5.000 | ESCALA | $831 /unidad |
| 5.001 | 8.000 | ESCALA | $780 /unidad |
| 8.001 | 12.000 | ESCALA | $726 /unidad |
| 12.001 | 15.000 | ESCALA | $675 /unidad |
| 15.001 | 20.000 | ESCALA | $594 /unidad |
| 20.001 | 25.000 | ESCALA | $549 /unidad |
| 25.001 | 30.000 | ESCALA | $507 /unidad |
| 30.001 | 35.000 | ESCALA | $459 /unidad |
| 35.001 | en adelante | ESCALA | $417 /unidad |
| — | — | **MANTENIMIENTO** | **$1.839.270** |

**Pregunta:** ¿"MANTENIMIENTO" es un cargo fijo adicional que se suma **cada mes** al resultado del cálculo por escala (es decir, el cliente paga escala + $1.839.270), o es un concepto totalmente aparte (por ejemplo, un cargo anual o de implementación) que no debería mezclarse con la tabla de escala de arriba?

#### ✅ Respuesta confirmada por Contabilidad (2026-08-31)

Confirmado: la parte transaccional se cobra normal por ESCALA (según el volumen del mes), y el MANTENIMIENTO es un cargo fijo que se suma **todos los meses**, sin importar cuántas transacciones haya (incluso si son 0).

**Fórmula:**

```
factura = (cálculo normal por ESCALA sobre el volumen del mes) + $1.839.270 (mantenimiento fijo mensual)
```

Se revisaron los 4 archivos completos: **SAN CARLOS es el único cliente con modelo `MANTENIMIENTO`** — no hay otros casos de este tipo.

---

## C. Servicios que se están facturando hoy pero no tienen ninguna tabla de tarifa

Esto no es un problema de qué modelo usar — es que **no existe ninguna tarifa registrada** para dinero que sí se está cobrando. Se detectó cruzando la tabla de tarifas contra la facturación real de julio de 2026 (hoja "1 paso" del Excel origen).

| # | Cliente | Servicio | Magnitud aproximada (jul-2026) | Archivo |
|---|---|---|---|---|
| C1 | SEGUROS DEL ESTADO | ISOAT (emisión pólizas SOAT) | ~$58,5 millones/mes | SEGUROS |
| C1 | SEGUROS DEL ESTADO | BIZUIT (licencias + mantenimiento) | ~$15,2 millones/mes | SEGUROS |
| C1 | SEGUROS DEL ESTADO | ISEGUROS-Cotizadores (Autos/Hogar/Copropiedades/Acc. Personales) | sin cuantificar | SEGUROS |
| C1 | SEGUROS DEL ESTADO | Submódulo SARLAFT (Portal Único Intermediario) | sin cuantificar | SEGUROS |
| C2 | LIBERTY SEGUROS | Emisión SOAT (ISOAT) | con ajuste/crédito ese mes | SEGUROS |
| C3 | AXA | "VENTA CRUZADA SOAT - RC" | sin cuantificar | SEGUROS |
| C4 | PREVISORA | INSURCLOUD | 198 unidades, $665.000 | SEGUROS |
| C5 | ANALISIS Y SEGUROS LTDA (NIT 900085844) | INSURCLOUD | sin cuantificar — **cliente ni siquiera está en la hoja Clientes del archivo** | SEGUROS |
| C5 | NACIONAL DE SEGUROS S.A. (NIT 860002527) | INSURCLOUD | sin cuantificar — **cliente ni siquiera está en la hoja Clientes del archivo** | SEGUROS |
| C6 | HDI SEGUROS | ISOAT | 397 emisiones — sin NIT identificado | SEGUROS |
| C7 | EXPRESO S.A.S. (NIT 800206979) | RIPS | sin cuantificar | SALUD |
| C7 | "CLINICA SAN RAFAEL" (NIT 900342064, distinta de Hospital Univ. Clínica San Rafael) | RIPS | sin cuantificar | SALUD |
| C8 | ECOPETROL | (todos) | variable — **la nota del archivo dice explícitamente que la tarifa no está habilitada, cambia mes a mes y el cliente la informa mediante acta** | FACTURA |

**Pregunta:** para C1–C7, ¿nos pueden dar la tarifa/contrato de cada uno para poder cargarlos? Para C8 (ECOPETROL), ¿cómo prefieren que el sistema maneje un monto que cambia cada mes por acuerdo mensual en vez de tabla fija? (posible opción: tratarlo como "fijo mensual" pero editable cada mes, en vez de un valor versionado por año como el resto).

---

## D. Un mismo mínimo/contrato compartido entre varios clientes (NIT) distintos

### D1. Circular 001 — EQUIDAD SEGUROS, LIBERTY SEGUROS y ZURICH comparten el mismo mínimo garantizado

Los 3 clientes tienen registrado el mismo monto para "ESTAMPADO CRONOLÓGICO CIRCULAR 001 — MÍNIMO GARANTIZADO (contrato 1948)": **$1.561.128**.

### D2. Contrato 1945 — SURA y BOLIVAR comparten la estructura pero con montos distintos

"FIRMA DIGITAL Y QR / ANDES (contrato 1945)": SURA = $1.357.440, BOLIVAR = $2.186.980 — misma estructura de servicio, mínimos diferentes.

#### ✅ Respuesta confirmada por Contabilidad (2026-09-04)

Igual que D1, pero aquí además la **negociación de tarifa fue distinta para cada cliente** (por eso los mínimos difieren): contratos independientes, misma estructura de servicio, valores propios de cada uno. Tampoco requiere cambios de código.

**Pregunta:** ¿"contrato 1948"/"1945" son convenios marco (ej. Fasecolda / Circular de la Superfinanciera) que fijan una tarifa o estructura para varias aseguradoras a la vez, y cada aseguradora igual se factura de forma independiente con su propio NIT (solo que casualmente comparten o no el mismo mínimo)? Queremos confirmar que no hace falta "una sola factura repartida entre 3 clientes" — que son 3 facturas independientes que simplemente comparten una cifra pactada externamente.

#### ✅ Respuesta confirmada por Contabilidad (2026-09-04)

Confirmado: **no es el mismo contrato compartido.** A cada uno de los 3 clientes (EQUIDAD SEGUROS, LIBERTY SEGUROS, ZURICH) se le creó un **contrato independiente**, y esos 3 contratos casualmente comparten el mismo esquema/valor de tarifa (el pactado en la Circular 001). El modelo actual (1 contrato = 1 cliente, cada uno con su propia factura) ya alcanza — **no se requiere ningún cambio de código** para este caso.

### D3. "Sub-cuentas del contrato GRUPO OSPEDALE" — 11 clientes con NIT propio bajo un solo contrato

**Archivo:** FACTURA. Clientes marcados con la nota "Sub-cuenta del contrato GRUPO OSPEDALE": CARDIOGROUP DEL QUINDIO, CLINICA ANTIOQUIA, CLINICA CENTRAL DEL QUINDIO, CLINICA JUAN N CORPAS, CLINICA LA ESTANCIA, CLINICA LA MERCED BARRANQUILLA, CLINICA LOS ROSALES, CLINICA OSPEDALE MANIZALES, NUEVA CLINICA SAGRADO CORAZON, SOCIEDAD N.S.D.R., UNIDAD DE HEMODINAMIA DEL CAFE, GRUPO OPERADOR CLINICO HOSPITALARIO POR OUTSOURCING.

**Pregunta — esta es importante para el diseño del sistema:** ¿cada una de estas 11 clínicas recibe su **propia factura** con su propio NIT (y el "contrato GRUPO OSPEDALE" es solo el nombre comercial del convenio marco que les fija la tarifa), o realmente Transfiriendo emite **una sola factura consolidada** a nombre de GRUPO OSPEDALE por el total de las 11? La respuesta cambia si necesitamos construir algo nuevo (facturación consolidada de varios NIT) o si el modelo actual (1 contrato = 1 cliente) ya alcanza.

#### ✅ Respuesta confirmada por Contabilidad (2026-09-04)

Confirmado: **cada una de las 11 empresas del grupo recibe su propia factura independiente.** "GRUPO OSPEDALE" es solo el nombre comercial del convenio marco. El modelo actual (1 contrato = 1 cliente = 1 factura) ya alcanza — **no hace falta construir facturación consolidada multi-NIT.**

---

## E. Un dato reclasificado por criterio, no confirmado contra la fuente original

**E1. SOCIEDAD DE CIRUGIA HOSPITAL SAN JOSE (SALUD):** el único dato con año válido (ANEXO 1 4747, 2023-2024) se movió de "ESCALA" a "MINIMO GARANTIZADO" solo porque el monto era demasiado alto para ser una tarifa por transacción — es una inferencia nuestra, no algo que diga el Excel.

**Pregunta:** ¿pueden confirmar si efectivamente es un mínimo garantizado?

#### ✅ Respuesta confirmada por Contabilidad (2026-09-04)

Este cliente **ya no está activo.** Aplicado en el sistema: `SOCIEDAD DE CIRUGIA DE BTA-HOSPITAL DE SAN JOSE` (id 278) se marcó `estado = retirado` en producción el 2026-09-04. Con esto la pregunta sobre si es mínimo garantizado o escala queda sin efecto (no se va a liquidar).

---

## F. Casos donde el año de la tarifa no es confiable

Estos no cambian el modelo, pero si el año está mal, la tarifa 2026 que se le cobre al cliente puede ser incorrecta.

| # | Cliente | Archivo | Detalle |
|---|---|---|---|
| F1 | CTIC | FACTURA | Nota: "revisar contrato en junio 2023 ya que la tabla cambia sus valores" — sin más contexto sobre qué cambia |
| F2 | SEGUROS DEL ESTADO — servicio CONSULTAS RUNT | RECAUDO | Los años del Excel origen decían 2024/2023; se corrigieron a 2025/2024 por inferencia contra lo realmente facturado, no porque el Excel lo rotulara así |
| F3 | COMFENALCO VALLE | SALUD | La tabla de origen está en una hoja titulada "OCTUBRE 2022"; se validó como vigente solo porque el mínimo coincide con lo facturado en julio 2026 |
| F4 | AVIDANTI ARMENIA | SALUD | Se **excluyó** un valor de $35.347.200 (dinero real) por un multiplicador "x7" en la hoja original sin ninguna explicación — no se pudo determinar año ni criterio de cálculo |
| F5 | SAN RAFAEL | SALUD | Hay bandas de escala (0–5.000 y 8.000–9.999.999) y un mínimo garantizado **sin que se sepa a qué servicio corresponden** — el bloque de origen no tenía rótulo de servicio |

**Pregunta:** para F1–F3, ¿pueden confirmar el año correcto? Para F4, ¿qué es el multiplicador "x7" y a qué servicio/año corresponde ese $35.347.200? Para F5, ¿a qué servicio de SAN RAFAEL corresponden esas bandas?

#### ✅ Respuestas confirmadas por Contabilidad (2026-09-04)

- **F1 (CTIC):** confirmado, año y tarifas están OK — no requiere cambios.
- **F2 (SEGUROS DEL ESTADO — CONSULTAS RUNT):** confirmado, año y tarifas están OK — no requiere cambios.
- **F3 (COMFENALCO VALLE):** este cliente **se retiró.** No existe todavía como registro en el sistema (no se ha migrado esa línea de negocio), así que no hay nada que marcar hoy — queda documentado para que, cuando se cargue, se cree directamente con `estado = retirado`.
- **F4 (AVIDANTI ARMENIA):** confirmado — **no se debe contemplar ni el valor de $35.347.200 ni el multiplicador "x7".** Se descarta definitivamente (ya estaba excluido de la carga; queda confirmado como decisión final, no como dato pendiente).
- **F5 (SAN RAFAEL):** confirmado — **SAN RAFAEL ya no está en el servicio de SALUD.** Esas bandas de escala y el mínimo garantizado sin rótulo de servicio **no le pertenecen a SAN RAFAEL en SALUD** y no deben cargarse como tarifa suya en ese producto. (El cliente `HOSPITAL UNIVERSITARIO CLINICA SAN RAFAEL` sigue activo en el sistema por otras líneas de negocio — esto solo aplica a la atribución de ese bloque de datos ambiguo en el archivo SALUD.)

---

## G. Informativo — no bloquea el cálculo, pero puede generar contratos duplicados o clientes mal identificados si no se corrige antes de cargar

- **REDSPIRE** (SALUD): en el Excel original aparece rotulado "REDSPIRRE" (typo, ya corregido en nuestro archivo). Factura $0 en julio 2026 pese a tener transacciones registradas — ¿sigue activo?
- **BOLIVAR** (SEGUROS): los sub-encabezados del Excel original decían "SURA" por un aparente copiar/pegar — ya corregido.
- **STRATEGOS** (SALUD): en el Excel original aparece como "ESTRATEGOS" — ya corregido.
- **8 clientes retirados sin fecha** en FACTURA (solo nota "cliente retirado", sin fecha ni motivo): AUROS COPIAS, DELTAGAS, GRUPO ACO, GRUPO NUTRESA, JLT, LEGIS.
- **2 clientes retirados con motivo confirmado** en SALUD: HOSPITAL UNIVERSITARIO SAN IGNACIO (HUSI) y CLINICA UNIVERSIDAD DE LA SABANA — ambos con nota explícita de que dejaron de transaccionar.

#### ✅ Respuestas confirmadas por Contabilidad (2026-09-04)

- **REDSPIRE:** sigue **activo** como cliente (el $0 de julio no significa retiro). Sin cambios.
- **STRATEGOS:** confirmado — el nombre correcto es **STRATEGOS** (no "ESTRATEGOS"); la corrección ya aplicada fue la correcta.
- **BOLIVAR (SEGUROS):** confirmado — efectivamente fue un error de copiar/pegar en el Excel original; las tarifas e información pertenecen a **BOLIVAR** (`SEGUROS COMERCIALES BOLIVAR S.A`), no a SURA. La corrección ya aplicada fue la correcta.
- **HUSI y CLINICA UNIVERSIDAD DE LA SABANA (SALUD):** confirmado que dejaron de transaccionar. **Aplicado en el sistema:** `HOSPITAL UNIVERSITARIO DE SAN IGNACIO` (id 158) y `CLINICA UNIVERSIDAD DE LA SABANA` (id 71) se marcaron `estado = retirado` en producción el 2026-09-04.
- **8 clientes de FACTURA:** confirmado — **AUROS COPIAS, DELTAGAS, GRUPO ACO, GRUPO NUTRESA y JLT están retirados**; **LEGIS sigue activo** (excluido del retiro). Ninguno de los 5 retirados existe todavía como registro en el sistema (esa línea de negocio de FACTURA aún no se ha migrado con contratos), así que no hay nada que marcar hoy — queda documentado para que se creen directamente con `estado = retirado` cuando se migren. `LEGIS EDITORES S.A.` (id 187) ya existe y está correctamente `activo` — sin cambios.

---

## Resumen para priorizar la revisión

| Bloque | Cantidad de casos | Estado |
|---|---|---|
| A — Mínimo garantizado no calza con el motor | 4 casos puntuales + patrón general (53 grupos) | ✅ **Resuelto y programado** (2026-08-31) — franquicia confirmada, motor de cálculo actualizado |
| B — Modelo "BOLSA" sin soporte | 3 clientes, posible 4° modelo nuevo | ✅ **Resuelto y programado** (2026-08-31) — 4° modelo confirmado e implementado |
| C — Servicios facturados sin tarifa | 13 casos, incluye el bloque de mayor valor del archivo SEGUROS (~$74M/mes) | Pendiente — sigue abierto, falta la tarifa/contrato de cada caso |
| D — Contratos/mínimos compartidos entre NIT | 2 patrones (Circular 001/1945) + 11 sub-cuentas GRUPO OSPEDALE | ✅ **Resuelto** (2026-09-04) — son contratos/facturas independientes; el modelo actual ya alcanza, sin cambios de código |
| E — Reclasificación sin confirmar | 1 caso | ✅ **Resuelto** (2026-09-04) — cliente retirado en el sistema |
| F — Año no confiable | 5 casos | ✅ **Resuelto** (2026-09-04) — F1/F2 confirmados OK, F3 cliente retirado, F4 valor descartado definitivamente, F5 dato no le pertenece a SAN RAFAEL en SALUD |
| G — Informativo | 5 notas | ✅ **Resuelto** (2026-09-04) — nombres/atribuciones confirmados; 2 clientes retirados en el sistema, 5 más documentados para cuando se migren |
