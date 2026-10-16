"""
Migración de la hoja MATRIZ FACTURACION -> maestro de facturación (Etapa 2).

Lee SOLO las columnas del maestro (cómo se factura/contabiliza por cliente),
NO los montos ni la cascada (eso es Etapa 3). Por cada fila con NIT crea/actualiza
el cliente (por NIT real) y carga una línea vía la API. Idempotente. Genera reporte.

Uso:  python migration/cargar_matriz.py   (requiere la API en localhost:3000)
"""
import json
import os
import unicodedata
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

import openpyxl

from fuente import excel_matriz

ARCHIVO = excel_matriz()
HOJA = "MATRIZ FACTURACION"
API = os.environ.get("COE_API", "http://localhost:3000/api")
ADMIN_USER, ADMIN_PASS = "admin", "Admin123*"

# Cabecera (normalizada) -> campo del maestro
CAMPOS = {
    "CTA CONTABLE": "cuentaContable",
    "UNIDAD DE NEGOCIO": "unidadNegocio",
    "PLAZO": "plazoDias",
    "RECIBE FRA": "recibeFra",
    "CORREO CONTACTO": "correoContacto",
    "COD. CC": "centroCosto",
    "COD. SUB CC": "subCentroCosto",
    "DESC. CC": "descCentroCosto",
    "REFERENCIA": "referencia",
    "COD. IFACTURA": "codIfactura",
    "COD.SIIGO": "codSiigo",
    "CONCEPTO": "concepto",
    "DESCRIPCION FCATURA": "descripcionFactura",
    "DESCRIPCION FACTURA": "descripcionFactura",
    "OBSERVACIONES": "observaciones",
}
# Al toparse con una de estas cabeceras, dejamos de mapear (empiezan las columnas de cálculo = Etapa 3)
LIMITE_CALCULO = ("CANT", "V/R UNI", "SUB TOTAL", "FIJO MENSUAL", "MINIMO G", "INCREMENTO", "DOC. MES")


def norm(s):
    if s is None:
        return ""
    s = "".join(c for c in unicodedata.normalize("NFKD", str(s)) if not unicodedata.combining(c))
    return " ".join(s.split()).upper().strip()


def to_text(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    s = str(v).strip()
    return s or None


def http(method, path, body=None, token=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(API + "/" + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read().decode("utf-8")
            return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode("utf-8")
        try:
            return e.code, json.loads(t)
        except json.JSONDecodeError:
            return e.code, {"message": t}


def main():
    wb = openpyxl.load_workbook(ARCHIVO, read_only=True, data_only=True)
    ws = wb[HOJA]
    filas = list(ws.iter_rows(values_only=True))

    # Detectar fila de cabecera (la que tiene NIT y TERCERO) y mapear columnas
    hdr_idx = None
    for i, fila in enumerate(filas[:10]):
        vals = [norm(c) for c in fila]
        if "NIT" in vals and "TERCERO" in vals:
            hdr_idx = i
            break
    if hdr_idx is None:
        print("ERROR: no encuentro la cabecera (NIT/TERCERO)")
        return
    hdr = [norm(c) for c in filas[hdr_idx]]

    col_nit = hdr.index("NIT")
    col_tercero = hdr.index("TERCERO")
    colmap = {}  # campo -> indice de columna
    for c, h in enumerate(hdr):
        if any(k in h for k in LIMITE_CALCULO):
            break
        if h in CAMPOS and CAMPOS[h] not in colmap:
            colmap[CAMPOS[h]] = c

    # Login
    st, login = http("POST", "auth/login", {"username": ADMIN_USER, "password": ADMIN_PASS})
    token = login["accessToken"]

    cache_cli = {}
    creadas, saltadas, fallidas, clientes_nuevos = [], [], [], 0

    def get_cliente(nit, razon):
        nonlocal clientes_nuevos
        if nit in cache_cli:
            return cache_cli[nit]
        st, res = http("GET", f"clientes?busqueda={urllib.parse.quote(nit)}&limit=20", token=token)
        ex = next((c for c in res["data"] if c["nit"] == nit), None) if res else None
        if ex:
            cache_cli[nit] = ex["id"]
            return ex["id"]
        st, res = http("POST", "clientes", {"nit": nit, "razonSocial": (razon or nit)[:255]}, token=token)
        if st in (200, 201):
            clientes_nuevos += 1
            cache_cli[nit] = res["id"]
            return res["id"]
        raise RuntimeError(f"cliente {nit}: {res}")

    def lineas_de(cliente_id):
        st, res = http("GET", f"lineas-facturacion?clienteId={cliente_id}&limit=100", token=token)
        return res["data"] if res else []

    for fila in filas[hdr_idx + 1:]:
        nit = to_text(fila[col_nit]) if col_nit < len(fila) else None
        if not nit:
            continue
        razon = to_text(fila[col_tercero]) if col_tercero < len(fila) else None
        nota_a = norm(fila[0]) if len(fila) > 0 else ""

        body = {}
        for campo, c in colmap.items():
            if c >= len(fila):
                continue
            val = fila[c]
            if campo == "plazoDias":
                try:
                    body[campo] = int(val) if val not in (None, "") else None
                except (TypeError, ValueError):
                    body[campo] = None
            else:
                body[campo] = to_text(val)
        body = {k: v for k, v in body.items() if v is not None}
        if "no siguen facturando" in nota_a.lower() or "NO SIGUEN" in nota_a:
            body["estado"] = "inactivo"

        try:
            cliente_id = get_cliente(nit, razon)
        except RuntimeError as e:
            fallidas.append((nit, str(e)))
            continue
        body["clienteId"] = cliente_id

        # Idempotencia: misma referencia para el cliente
        ref = body.get("referencia")
        existentes = lineas_de(cliente_id)
        if any((l.get("referencia") or "") == (ref or "") for l in existentes):
            saltadas.append(f"{razon or nit} / {ref or '(sin ref)'}")
            continue

        st, res = http("POST", "lineas-facturacion", body, token=token)
        if st in (200, 201):
            creadas.append(f"{razon or nit} / {ref or '(sin ref)'}")
        else:
            msg = res.get("message") if isinstance(res, dict) else res
            fallidas.append((f"{razon or nit}", f"HTTP {st}: {msg}"))

    out = []
    out.append("=" * 64)
    out.append("REPORTE DE CARGA — MATRIZ FACTURACION (maestro de facturación)")
    out.append("=" * 64)
    out.append(f"Columnas del maestro mapeadas: {sorted(colmap.keys())}")
    out.append(f"Líneas creadas:        {len(creadas)}")
    out.append(f"Saltadas (existían):   {len(saltadas)}")
    out.append(f"Fallidas:              {len(fallidas)}")
    out.append(f"Clientes nuevos (NIT real) creados: {clientes_nuevos}")
    out.append("")
    out.append("NOTA: el enlace automatico con contrato_item de Etapa 1 NO se hace aqui:")
    out.append("los NIT reales de MATRIZ no coinciden con los placeholder de CONTRATOS COE.")
    out.append("Reconciliacion cliente-contrato queda como tarea con Contabilidad.")
    out.append("")
    out.append("----- FALLIDAS -----")
    out.extend(f"  {n} -> {m}" for n, m in fallidas[:50])
    texto = "\n".join(out)
    Path("migration/reporte_matriz.txt").write_text(texto, encoding="utf-8")
    print(texto.encode("ascii", "replace").decode("ascii"))


if __name__ == "__main__":
    main()
