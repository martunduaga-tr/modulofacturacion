"""
Propaga la baja logica de cliente -> contrato.

El estado de cliente ('activo'/'retirado') y el de contrato ('activo'/'inactivo')
son campos independientes en el backend; retirar un cliente NO marca sus
contratos. El listado de /contratos filtra solo por c.estado, asi que un cliente
retirado con contratos 'activo' sigue apareciendo. Este script marca 'inactivo'
todos los contratos de los clientes ya retirados.

Por defecto SOLO REPORTA. Con --aplicar marca los contratos (PATCH /contratos/:id).

Uso:
  python migration/propagar_baja_contratos.py             # solo reporte
  python migration/propagar_baja_contratos.py --aplicar
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

API = os.environ.get("COE_API", "http://localhost:3000/api")
ADMIN_USER, ADMIN_PASS = "admin", "Admin123*"


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


def main():
    aplicar = "--aplicar" in sys.argv

    st, login = http("POST", "auth/login", {"username": ADMIN_USER, "password": ADMIN_PASS})
    if st not in (200, 201):
        raise SystemExit(f"ERROR login: {st} {login}")
    token = login["accessToken"]

    contratos, page = [], 1
    while True:
        st, res = http("GET", f"contratos?limit=100&page={page}", token=token)
        contratos += res["data"]
        if page >= res["totalPages"]:
            break
        page += 1

    # cliente embebido en el listado ya trae su estado -> no hace falta N+1.
    afectados = [c for c in contratos
                 if c.get("cliente", {}).get("estado") == "retirado" and c["estado"] != "inactivo"]

    print(f"Contratos totales: {len(contratos)}")
    print(f"De cliente retirado y aun 'activo': {len(afectados)}")
    print(f"Modo: {'APLICAR' if aplicar else 'SOLO REPORTE'}")
    print()
    for c in sorted(afectados, key=lambda x: x["nombreContrato"]):
        print(f"  {c['nombreContrato']}")

    if not aplicar:
        return

    ok, err = 0, []
    for c in afectados:
        st, res = http("PATCH", f"contratos/{c['id']}", {"estado": "inactivo"}, token=token)
        if st in (200, 201):
            ok += 1
        else:
            err.append((c["nombreContrato"], f"HTTP {st}: {res}"))

    print()
    print(f"----- APLICADO -----")
    print(f"  Marcados 'inactivo': {ok}")
    if err:
        print(f"  Con error: {len(err)}")
        for n, m in err:
            print(f"    {n} -> {m}")


if __name__ == "__main__":
    main()
