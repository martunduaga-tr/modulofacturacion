"""
Cargador de SOLO CLIENTES desde CONTRATOS COE (iFactura), sin contratos.

Lee migration/bloques_parseados.json (mismo parser que cargar_contratos.py) y crea
un cliente por NIT/nombre unico via /api/clientes. Idempotente.

El estado (activo/retirado) se calcula offline con la MISMA regla de
revisar_vigencia_2026.py --ultimo-anio 2023 (corte de vigencia), pero leyendo los
anios directo del Excel en vez de contratos ya cargados en la BD -- por eso puede
correr ANTES de cargar contratos:
  - Si el cliente tiene tarifa 2026 -> activo.
  - Si su bloque tiene una columna de anio ambigua en el Excel (rotulo repetido)
    -> activo (protegido: la falta de 2026 es un defecto de la hoja, no inactividad).
  - Si factura despues de 2023 pero no tiene 2026 -> activo (pendiente de cargar
    el anio, no inactivo).
  - Si su ultima tarifa es 2023 o anterior (o no tiene anios validos) -> retirado.

Uso:  python migration/cargar_clientes.py
Requiere la API levantada (COE_API) y el admin sembrado.
"""
import json
import os
import time
import hashlib
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

from inventario_contratos_coe import clasificar_duplicados

API = os.environ.get("COE_API", "http://localhost:3000/api")
ADMIN_USER = "admin"
ADMIN_PASS = "Admin123*"
ANIO_VIGENCIA = 2026
CORTE_BAJA = 2023  # ultima tarifa <= este anio -> retirado


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


def placeholder_nit(nombre):
    h = hashlib.md5(nombre.encode("utf-8")).hexdigest()[:8].upper()
    return "PEND-" + h


def anios_bloque(b):
    return set(b["anios"])


def agrupar_clientes(bloques_ok):
    """Un cliente puede traer 2 bloques (EMISION+RECEPCION); se agrupan por NIT."""
    grupos = {}  # nit -> {"nombre","nit_real","anios":set,"ambiguo":bool}
    for b in bloques_ok:
        nombre = (b["nombre"] or "").strip()
        if not nombre:
            continue
        nit_real = b["nit"]
        nit = nit_real or placeholder_nit(nombre)
        g = grupos.setdefault(nit, {"nombre": nombre, "nit_real": nit_real,
                                     "anios": set(), "ambiguo": False})
        g["anios"] |= anios_bloque(b)
        if b.get("cols_duplicadas"):
            g["ambiguo"] = True
    return grupos


def estado_de(g):
    if ANIO_VIGENCIA in g["anios"]:
        return "activo", "tiene tarifa 2026"
    if g["ambiguo"]:
        return "activo", "protegido (anio ambiguo en el Excel)"
    if g["anios"] and max(g["anios"]) > CORTE_BAJA:
        return "activo", f"reciente (ultimo anio {max(g['anios'])}, pendiente 2026)"
    ultimo = max(g["anios"]) if g["anios"] else None
    return "retirado", f"sin tarifa desde {ultimo}" if ultimo else "sin anios validos en el Excel"


def main():
    ruta = Path("migration/bloques_parseados.json")
    if not ruta.exists():
        print("ERROR: corre primero parse_contratos_coe.py")
        return
    todos = json.loads(ruta.read_text(encoding="utf-8"))["ok"]

    decision = clasificar_duplicados(todos)
    bloques_ok = [b for b in todos if decision[id(b)][0] == "OK"]

    grupos = agrupar_clientes(bloques_ok)

    st, login = http("POST", "auth/login", {"username": ADMIN_USER, "password": ADMIN_PASS})
    if st not in (200, 201):
        print(f"ERROR login: {st} {login}")
        return
    token = login["accessToken"]

    creados, actualizados, saltados, fallidos, placeholders = [], [], [], [], 0
    activos, retirados = 0, 0

    for nit, g in sorted(grupos.items(), key=lambda kv: kv[1]["nombre"]):
        nombre = g["nombre"]
        es_placeholder = not g["nit_real"]
        if es_placeholder:
            placeholders += 1
        estado, motivo = estado_de(g)
        if estado == "activo":
            activos += 1
        else:
            retirados += 1

        st, res = http("GET", f"clientes?busqueda={urllib.parse.quote(nit)}&limit=20", token=token)
        existente = next((c for c in (res["data"] if res else []) if c["nit"] == nit), None)

        if existente:
            if existente["estado"] != estado:
                st2, res2 = http("PATCH", f"clientes/{existente['id']}", {"estado": estado}, token=token)
                if st2 in (200, 201):
                    actualizados.append(f"{nombre} -> {estado} ({motivo})")
                else:
                    fallidos.append((nombre, f"PATCH estado HTTP {st2}: {res2}"))
            else:
                saltados.append(nombre)
            continue

        body = {"nit": nit, "razonSocial": nombre[:255], "estado": estado}
        obs = []
        if es_placeholder:
            obs.append("NIT pendiente de confirmar (migrado de CONTRATOS COE iFactura)")
        if estado == "retirado":
            obs.append(f"Retirado por vigencia: {motivo}")
        if obs:
            body["observaciones"] = "; ".join(obs)

        st, res = http("POST", "clientes", body, token=token)
        if st in (200, 201):
            creados.append(f"{nombre} [{nit}] -> {estado} ({motivo})")
        else:
            fallidos.append((nombre, f"POST HTTP {st}: {res}"))

    out = []
    out.append("=" * 70)
    out.append("REPORTE DE CARGA — solo CLIENTES (CONTRATOS COE / iFactura)")
    out.append("=" * 70)
    out.append(f"Clientes creados:         {len(creados)}")
    out.append(f"Clientes actualizados:    {len(actualizados)}")
    out.append(f"Ya existian (sin cambio): {len(saltados)}")
    out.append(f"Fallidos:                 {len(fallidos)}")
    out.append(f"Con NIT placeholder:      {placeholders}")
    out.append(f"Activos / Retirados:      {activos} / {retirados}")
    out.append("")
    out.append("----- CREADOS -----")
    out.extend("  " + c for c in creados)
    if actualizados:
        out.append("")
        out.append("----- ACTUALIZADOS (estado cambio) -----")
        out.extend("  " + c for c in actualizados)
    if fallidos:
        out.append("")
        out.append("----- FALLIDOS -----")
        out.extend(f"  {n} -> {m}" for n, m in fallidos)

    texto = "\n".join(out)
    print(texto)
    Path("migration/reporte_carga_clientes.txt").write_text(texto, encoding="utf-8")


if __name__ == "__main__":
    main()
