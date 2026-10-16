---
name: calculo-determinista
description: Construye y valida el motor de cálculo de facturas del sistema de Transfiriendo (etapas 3-4). Úsala SIEMPRE que el trabajo implique calcular montos a facturar, aplicar tarifas a volúmenes, la cascada tributaria, generar el pre-liquidado, o cualquier lógica que produzca un valor que terminará en una factura. Refuerza que el cálculo es DETERMINÍSTICO (nunca lo hace un LLM) y exige trazabilidad y aprobación humana. Si el usuario menciona "el motor de cálculo", "calcular las facturas", "pre-liquidado", "liquidar", "aplicar tarifas", o la generación de facturas, esta skill aplica.
---

# Motor de cálculo determinístico — Transfiriendo

Calcula cuánto facturar a cada cliente. Consulta `facturacion-domain` para los modelos de cobro y la cascada tributaria — esta skill asume esas reglas y se enfoca en cómo implementarlas con seguridad fiscal.

## Principio inviolable

**El cálculo de un monto que va a una factura es 100% determinístico y reproducible. Nunca lo hace un LLM ni un proceso no determinista.** Un error de cálculo aquí es un error fiscal y legal. La IA tiene exactamente dos roles permitidos, y ninguno toca el número:

1. **Detección de anomalías** (asistencia a la revisión): señalar montos sospechosos para que un humano los mire. No corrige, no recalcula.
2. **Asistencia de migración/extracción** (etapa de carga, no de cálculo).

## Algoritmo de cálculo (por cliente, por item)

```
para cada contrato_item activo del cliente:
    volumen = volumen_mensual(cliente, producto, concepto, periodo)   # de la ingesta
    anio    = año del periodo a facturar

    según item.modelo_cobro:
      volumen_escalonado:
        escalon  = escalón donde volumen_desde <= volumen <= volumen_hasta (para anio)
        tarifa   = escalon.precio_unitario
        subtotal_base = volumen * tarifa            # TODO el volumen × una tarifa (NO por tramos)

      minimo_garantizado:                      # FRANQUICIA, no un piso tipo max()
        tope = minimo_del_anio.volumen_tope    # ej. ALKA MOTOR: tope=1.000
        si volumen <= tope:
          subtotal_base = minimo_del_anio.valor_minimo
        si no:
          escalon    = escalón donde cae el volumen TOTAL (no el del excedente)
          excedente  = volumen - tope
          subtotal_base = minimo_del_anio.valor_minimo + excedente * escalon.precio_unitario
        # ej. ALKA MOTOR: 3.500 trans., tope 1.000, min $251.359, escalón 3.001-5.000 @ $203,65
        #     -> 251.359 + (3.500-1.000)*203,65 = $760.484

      bolsa:                                   # 4° modelo: paquete plano por banda
        escalon  = escalón donde cae el volumen TOTAL (para anio)
        subtotal_base = escalon.precio_unitario     # NO se multiplica por volumen
        # ej. FUNDACION SALUD MIA EPS: 7.800 o 7.900 trans. (misma banda 7.501-8.000)
        #     -> siempre $1.312.108,57; a partir de 8.001 cambia de banda

      fijo_mensual:
        subtotal_base = valor_fijo_del_anio

    # recargo_fijo: opcional, para CUALQUIER modelo de cobro (ej. "MANTENIMIENTO"
    # de SAN CARLOS). Se suma siempre, sin importar el volumen.
    subtotal = subtotal_base + suma(recargos_fijos_del_item_y_anio)

    # cascada tributaria (tasas desde parametros_globales)
    iva     = subtotal * tasa_iva
    total   = subtotal + iva
    rtefte  = base_rtefte * tasa_rtefte
    rteica  = base_rteica * tasa_rteica
    rteiva  = iva * tasa_rteiva
    cartera = total - rtefte - rteica - rteiva

    guardar pre_liquidado(cliente, item, periodo, volumen, escalon_usado,
                          tarifa, subtotal, iva, total, retenciones, cartera,
                          desglose_completo)
```

## Reglas de implementación

- **Decimales exactos.** Usar tipo decimal/`BigDecimal`/`Decimal`, nunca float. Definir y documentar la política de redondeo (cuántos decimales, cómo se redondea) y aplicarla consistentemente.
- **Tasas parametrizadas.** Leer IVA y retenciones de `parametros_globales`. Nunca hardcodear. Las bases de cada retención son configurables (no asumir que todas son sobre el subtotal).
- **Desglose obligatorio.** Cada pre-liquidado guarda TODO: volumen, escalón usado, tarifa, año, subtotal, cada impuesto con su tasa y base, y la cartera. Sin desglose no hay trazabilidad → no es válido.
- **Determinismo verificable.** Misma entrada → mismo resultado, siempre. El motor debe tener pruebas unitarias con casos reales conocidos del Excel (ej. AXA: 243.936 × $50.904 = $12.417.318; franquicia ALKA MOTOR: $760.484; bolsa FUNDACION SALUD MIA EPS: $1.312.108,57; recargo SAN CARLOS: +$1.839.270 — ver `backend/src/calculo/motor-calculo.spec.ts`).
- **Casos borde explícitos:** volumen cero, cliente sin tarifa para el año, escalón inexistente para el volumen, tarifa vencida. Cada uno produce una marca clara, no un cálculo silencioso erróneo.

## Flujo de la etapa 3 (cálculo)

```
ingesta de volúmenes (SQL Server, query parametrizado)
   → motor de cálculo (determinístico)
   → pre_liquidado con desglose
   → validación IA (marca anomalías, NO recalcula)
   → dashboard de aprobación (humano aprueba)
```

## Flujo de la etapa 4 (emisión)

Solo lo APROBADO se emite:

```
pre_liquidado aprobado
   → emisión en lote vía API iFactura
   → recepción de CUFE / respuesta DIAN
   → marcar estado (facturado / rechazado)
   → contabilización en SIIGO
```

- **Idempotencia obligatoria.** Un reintento nunca debe emitir dos veces la misma factura. Usar una clave de idempotencia por (cliente + item + periodo) y verificar estado antes de emitir.
- **Aprobación humana es un gate duro.** El código no debe tener ningún camino que emita sin el estado "aprobado".
- Confirmar pronto si iFactura expone API de emisión (es producto propio de Transfiriendo); no bloquea las etapas 1-3.

## Detección de anomalías (rol de la IA)

Señales útiles para marcar (no para corregir):
- Volumen cero o atípico vs. histórico del cliente.
- Monto fuera del rango histórico (ej. ±X% del promedio móvil).
- Cliente activo sin tarifa para el año.
- Tarifa cuyo año de vigencia ya pasó.

Se muestran como advertencia no bloqueante en el dashboard. La decisión siempre es humana.
