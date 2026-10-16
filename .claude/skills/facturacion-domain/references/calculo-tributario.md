# Cálculo tributario — orden y ejemplo

Tras obtener el `subtotal` (según el modelo de cobro), se aplica la cascada. Todas las tasas vienen de `parametros_globales` (editables, nunca hardcodear). Las retenciones aplican según los términos pactados de cada cliente — un cliente puede no estar sujeto a alguna.

## Orden de cálculo

```
subtotal        = (según modelo de cobro: escalonado / mínimo / fijo)

iva             = subtotal * tasa_iva                 # 19%
total           = subtotal + iva

# Retenciones (se calculan sobre la base que corresponda según norma;
# parametrizar la base por concepto). Se restan para obtener el neto a recaudar:
rtefte          = base_rtefte * tasa_rtefte           # 3,5% o 4%
rteica          = base_rteica * tasa_rteica           # 0,966%
rteiva          = iva * tasa_rteiva                   # 15% (retención SOBRE el IVA)
autorretencion  = subtotal * tasa_autorretencion      # 0,8% (informativa/contable)

valor_cartera   = total - rtefte - rteica - rteiva
```

> Nota: la autorretención es un movimiento contable propio, no una deducción del recaudo del cliente. Modelarla como dato informativo, no restarla del `valor_cartera` salvo que Contabilidad lo indique.

## Ejemplo numérico (caso real del Excel)

Cliente con mínimo garantizado, subtotal = $183.906:

```
subtotal        = 183.906
iva (19%)       = 34.942,14
total           = 218.848,14
rtefte (3,5%)   = 6.436,71      (sobre subtotal)
rteica (0,966%) = 1.776,53      (sobre subtotal)
rteiva (15%)    = ~? según base
autorretención  = 1.471         (informativa)
valor_cartera   = total - retenciones aplicables
```

## Reglas

- Cada factura calculada guarda TODO el desglose: subtotal, cada impuesto/retención con su tasa y base, y el valor cartera. Esto es la trazabilidad fiscal — sin desglose no hay auditoría.
- Las bases de cada retención deben ser parametrizables; no asumir que todas se calculan sobre el subtotal.
- Confirmar con Contabilidad la base exacta de RteFte, RteICA y RteIVA antes de fijar el cálculo en producción.
