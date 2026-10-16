"""
Ingesta de VOLÚMENES desde la hoja MATRIZ FACTURACION -> API (tabla volumenes).

Lee, por cliente, el NIT (col K), la REFERENCIA (col Q -> producto/concepto) y la
CANT del periodo (col Z), y los carga en lote vía POST /volumenes/ingesta.
El backend resuelve cliente/producto/concepto por código e intenta enlazar con
la tarifa de Etapa 1. Idempotente.

Periodo: el archivo es "ENERO 26" -> anio=2026, mes=1 (confirmar con Contabilidad).

Uso:  python migration/cargar_volumenes.py
"""
import json
import os
import urllib.request
import urllib.error
from pathlib import Path
import openpyxl

API = os.environ.get("COE_API", "http://localhost:3000/api")
ADMIN_USER, ADMIN_PASS = "admin", "Admin123*"
from fuente import excel_matriz

ARCHIVO = excel_matriz()
HOJA = "MATRIZ FACTURACION"
ANIO, MES = 2026, 1
ORIGEN = "MATRIZ ENERO 26"

COL_NIT, COL_REF, COL_CANT = 10, 16, 25  # K, Q, Z (0-based)


def http(method, path, body=None, token=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(API + "/" + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as resp:
            txt = resp.read().decode("utf-8")
            return resp.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, None


def concepto_de(ref):
    if ref and "recep" in str(ref).lower():
        return "RECEPCION"
    return "EMISION"


def main():
    st, login = http("POST", "auth/login", {"username": ADMIN_USER, "password": ADMIN_PASS})
    if st not in (200, 201):
        print("ERROR login:", st, login)
        return
    token = login["accessToken"]

    wb = openpyxl.load_workbook(ARCHIVO, read_only=True, data_only=True)
    ws = wb[HOJA]
    grid = [list(r) for r in ws.iter_rows(values_only=True)]

    items, saltados = [], 0
    for r in range(5, len(grid)):
        fila = grid[r]
        nit = fila[COL_NIT] if COL_NIT < len(fila) else None
        cant = fila[COL_CANT] if COL_CANT < len(fila) else None
        if nit is None or cant is None:
            continue
        # NIT: número o texto numérico; descartar URLs/textos largos
        nit_str = str(int(nit)) if isinstance(nit, (int, float)) else str(nit).strip()
        if len(nit_str) > 20 or "/" in nit_str or not any(c.isdigit() for c in nit_str):
            saltados += 1
            continue
        if not isinstance(cant, (int, float)):
            continue
        if int(round(cant)) < 0:  # cantidades negativas (ajustes) no son volumen facturable
            saltados += 1
            continue
        ref = fila[COL_REF] if COL_REF < len(fila) else None
        items.append({
            "nit": nit_str,
            "productoCodigo": "IFACTURA",
            "conceptoCodigo": concepto_de(ref),
            "anio": ANIO,
            "mes": MES,
            "cantidad": int(round(cant)),
            "origen": ORIGEN,
        })

    print(f"Filas con volumen a cargar: {len(items)}  (saltadas por NIT inválido: {saltados})")

    # Enviar en lotes
    total = {"procesados": 0, "insertados": 0, "actualizados": 0, "omitidos": []}
    LOTE = 200
    for i in range(0, len(items), LOTE):
        st, res = http("POST", "volumenes/ingesta", {"items": items[i:i + LOTE]}, token)
        if st not in (200, 201):
            print("ERROR ingesta:", st, res)
            continue
        for k in ("procesados", "insertados", "actualizados"):
            total[k] += res.get(k, 0)
        total["omitidos"].extend(res.get("omitidos", []))

    print("\n===== RESULTADO INGESTA =====")
    print(f"Procesados:   {total['procesados']}")
    print(f"Insertados:   {total['insertados']}")
    print(f"Actualizados: {total['actualizados']}")
    print(f"Omitidos:     {len(total['omitidos'])}")
    # Motivos de omisión (resumen)
    from collections import Counter
    motivos = Counter(o["motivo"] for o in total["omitidos"])
    for m, n in motivos.most_common(10):
        print(f"   {n:>4}  {m}")

    Path("migration/reporte_volumenes.txt").write_text(
        json.dumps(total, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
