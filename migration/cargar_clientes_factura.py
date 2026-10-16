"""
Cargador de clientes desde DATACLIENTESFACTURA.xlsx (Hoja1: NIT, DIG.VER.,
NOMBRE, FECHA, TRANSVERSAL, SERVICIOS).

A diferencia de cargar_clientes.py (que viene de CONTRATOS COE / iFactura y
resuelve NIT ausente con placeholder PEND-), este archivo SI trae NIT + digito
de verificacion (DV) reales para las 302 cuentas unicas. Crea/actualiza por
NIT via /api/clientes. Idempotente.

Uso:  python migration/cargar_clientes_factura.py
Requiere la API levantada (COE_API) y el admin sembrado.
"""
import json
import os
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

import openpyxl

ARCHIVO = Path(__file__).resolve().parent.parent / "DATACLIENTESFACTURA.xlsx"
HOJA = "Hoja1"
API = os.environ.get("COE_API", "http://localhost:3000/api")
ADMIN_USER = "admin"
ADMIN_PASS = "Admin123*"


def http(method, path, body=None, token=None, intentos=5):
    url = API + "/" + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    ultimo = None
    for intento in range(1, intentos + 1):
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", "Bearer " + token)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                txt = resp.read().decode("utf-8")
                return resp.status, (json.loads(txt) if txt else None)
        except urllib.error.HTTPError as e:
            txt = e.read().decode("utf-8")
            try:
                return e.code, json.loads(txt)
            except json.JSONDecodeError:
                return e.code, {"message": txt}
        except (urllib.error.URLError, ConnectionError, TimeoutError, OSError) as e:
            ultimo = e
            if intento < intentos:
                time.sleep(2 * intento)
    raise RuntimeError(f"{method} {path}: red caida tras {intentos} intentos ({ultimo})")


def leer_clientes():
    """Une las 496 filas transaccionales por NIT -> {nit, dv, nombre}."""
    wb = openpyxl.load_workbook(ARCHIVO, data_only=True)
    ws = wb[HOJA]
    clientes = {}
    for nit, dv, nombre, *_ in ws.iter_rows(min_row=2, values_only=True):
        if nit is None:
            continue
        nit = str(int(nit)) if isinstance(nit, float) else str(nit).strip()
        dv = str(int(dv)) if isinstance(dv, (int, float)) else (str(dv).strip() if dv else None)
        nombre = " ".join((nombre or "").split())
        clientes[nit] = {"nit": nit, "dv": dv, "razonSocial": nombre}
    return clientes


def main():
    if not ARCHIVO.exists():
        print(f"ERROR: no encuentro {ARCHIVO}")
        return
    clientes = leer_clientes()

    st, login = http("POST", "auth/login", {"username": ADMIN_USER, "password": ADMIN_PASS})
    if st not in (200, 201):
        print(f"ERROR login: {st} {login}")
        return
    token = login["accessToken"]

    creados, actualizados, saltados, fallidos = [], [], [], []

    for nit, c in sorted(clientes.items(), key=lambda kv: kv[1]["razonSocial"]):
        st, res = http("GET", f"clientes?busqueda={urllib.parse.quote(nit)}&limit=20", token=token)
        existente = next((x for x in (res["data"] if res else []) if x["nit"] == nit), None)

        if existente:
            cambios = {}
            if not existente.get("dv") and c["dv"]:
                cambios["dv"] = c["dv"]
            if not cambios:
                saltados.append(c["razonSocial"])
                continue
            st2, res2 = http("PATCH", f"clientes/{existente['id']}", cambios, token=token)
            if st2 in (200, 201):
                actualizados.append(f"{c['razonSocial']} [{nit}] -> {cambios}")
            else:
                fallidos.append((c["razonSocial"], f"PATCH HTTP {st2}: {res2}"))
            continue

        body = {
            "nit": nit,
            "razonSocial": c["razonSocial"][:255],
            "estado": "activo",
        }
        if c["dv"]:
            body["dv"] = c["dv"]

        st, res = http("POST", "clientes", body, token=token)
        if st in (200, 201):
            creados.append(f"{c['razonSocial']} [{nit}-{c['dv']}]")
        else:
            fallidos.append((c["razonSocial"], f"POST HTTP {st}: {res}"))

    out = []
    out.append("=" * 70)
    out.append("REPORTE DE CARGA — CLIENTES (DATACLIENTESFACTURA.xlsx)")
    out.append("=" * 70)
    out.append(f"Clientes en el archivo:      {len(clientes)}")
    out.append(f"Creados:                     {len(creados)}")
    out.append(f"Actualizados (DV agregado):  {len(actualizados)}")
    out.append(f"Ya existian sin cambio:      {len(saltados)}")
    out.append(f"Fallidos:                    {len(fallidos)}")
    out.append("")
    out.append("----- CREADOS -----")
    out.extend("  " + c for c in creados)
    if actualizados:
        out.append("")
        out.append("----- ACTUALIZADOS -----")
        out.extend("  " + c for c in actualizados)
    if fallidos:
        out.append("")
        out.append("----- FALLIDOS -----")
        out.extend(f"  {n} -> {m}" for n, m in fallidos)

    texto = "\n".join(out)
    print(texto)
    Path("migration/reporte_carga_clientes_factura.txt").write_text(texto, encoding="utf-8")


if __name__ == "__main__":
    main()
