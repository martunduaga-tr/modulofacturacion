"""
Inventario legible de la hoja CONTRATOS COE -> CSV para revision con Contabilidad.

No carga nada. Lee migration/bloques_parseados.json (salida del parser) y produce
migration/inventario_contratos_coe.csv con una fila por bloque/tabla detectada,
marcando el estado y el motivo por el que un bloque no se cargaria tal cual.

Uso:  python migration/inventario_contratos_coe.py
"""
import csv
import json
import collections
from pathlib import Path

ENTRADA = Path("migration/bloques_parseados.json")
SALIDA = Path("migration/inventario_contratos_coe.csv")


def clave_precios(b):
    """(desde, hasta, anio) -> precio, para comparar dos tablas del mismo cliente."""
    return {(e["desde"], e["hasta"], anio): p
            for e in b["escalones"] for anio, p in e["precios"].items()}


def clasificar_duplicados(ok):
    """Para cada grupo cliente+concepto repetido, decide cual tabla manda.

    Si una tabla contiene a la otra con los MISMOS precios, la mas completa manda
    y la otra es una copia vieja. Si los precios difieren, no se decide aqui:
    elegir mal pone un precio erroneo en una factura.
    """
    grupos = collections.defaultdict(list)
    for b in ok:
        grupos[(b["nombre"], b["concepto"])].append(b)

    decision = {}  # id(bloque) -> (estado, nota)
    for (nombre, _), v in grupos.items():
        if len(v) == 1:
            decision[id(v[0])] = ("OK", "")
            continue
        mapas = [clave_precios(b) for b in v]
        comunes = set(mapas[0]) & set(mapas[1])
        difs = [c for c in comunes if abs(mapas[0][c] - mapas[1][c]) > 1e-9]
        if difs:
            for b in v:
                decision[id(b)] = ("CONFLICTO", f"{len(difs)} de {len(comunes)} precios difieren "
                                                f"entre las 2 tablas del mismo cliente")
            continue
        if set(mapas[0]) < set(mapas[1]):
            gana, pierde = v[1], v[0]
        elif set(mapas[1]) < set(mapas[0]):
            gana, pierde = v[0], v[1]
        else:
            for b in v:
                decision[id(b)] = ("CONFLICTO", "2 tablas del mismo cliente sin precios comparables "
                                                "(estructura de escalones distinta)")
            continue
        decision[id(gana)] = ("OK", f"tabla mas completa; reemplaza a la de fila ~{pierde['header_row']}")
        decision[id(pierde)] = ("DUPLICADO", f"copia mas corta; manda la de fila ~{gana['header_row']}")
    return decision


def main():
    if not ENTRADA.exists():
        raise SystemExit("ERROR: corre primero  python migration/parse_contratos_coe.py")
    d = json.loads(ENTRADA.read_text(encoding="utf-8"))
    ok, revision = d["ok"], d["revision"]
    decision = clasificar_duplicados(ok)

    filas = []
    for b in ok:
        estado, nota = decision[id(b)]
        filas.append((b, estado, nota))
    for b in revision:
        filas.append((b, "REVISION", "; ".join(b.get("motivos", []))))

    filas.sort(key=lambda t: (str(t[0]["nombre"]), t[0]["concepto"]))

    with SALIDA.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["cliente", "concepto", "modelo_cobro", "nit", "origen_nit",
                    "escalones", "anios", "tiene_2026", "fila_excel",
                    "col_anio_ambiguo", "estado", "nota"])
        for b, estado, nota in filas:
            anios = b["anios"]
            w.writerow([
                b["nombre"], b["concepto"], b["modelo"],
                b["nit"] or "", b["nit_match"],
                len(b["escalones"]),
                ",".join(map(str, anios)),
                "SI" if 2026 in anios else "NO",
                b["header_row"],
                ", ".join(f"{c}={a}" for c, a in b["cols_duplicadas"]),
                estado, nota,
            ])

    cuenta = collections.Counter(e for _, e, _ in filas)
    print(f"Escrito: {SALIDA}  ({len(filas)} filas)")
    for k, v in sorted(cuenta.items()):
        print(f"  {k:<10} {v}")
    print(f"  {'con 2026':<10} {sum(1 for b, e, _ in filas if e == 'OK' and 2026 in b['anios'])} de {cuenta['OK']} cargables")


if __name__ == "__main__":
    main()
