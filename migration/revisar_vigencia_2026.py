"""
Revision de vigencia 2026: que clientes de la plataforma NO tienen tarifa 2026.

Por defecto SOLO REPORTA (no toca nada). Con --aplicar marca como 'retirado' los
clientes sin tarifa 2026 (baja logica del backend, auditada y reversible).

Excluye siempre los clientes cuyo bloque del Excel trae DOS columnas rotuladas con
el mismo anio: ahi la falta de 2026 es un defecto de rotulo en la hoja, no un
cliente inactivo. Darlos de baja seria borrar clientes vigentes.

"Sin tarifa 2026" NO es lo mismo que "cliente inactivo": un cliente con tarifas
hasta 2025 lo mas probable es que solo este pendiente de que le carguen la del
anio. Por eso la baja se limita con --ultimo-anio: solo se retira a quien no
factura desde ese anio o antes. Sin ese limite se retirarian clientes vigentes.

Uso:
  python migration/revisar_vigencia_2026.py                        # solo reporte
  python migration/revisar_vigencia_2026.py --ultimo-anio 2023     # reporte acotado
  python migration/revisar_vigencia_2026.py --ultimo-anio 2023 --aplicar
  python migration/revisar_vigencia_2026.py --aplicar --incluir-ambiguos
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

API = os.environ.get("COE_API", "http://localhost:3000/api")
ADMIN_USER, ADMIN_PASS = "admin", "Admin123*"
ANIO = 2026


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


def nombres_con_anio_ambiguo():
    """Clientes cuyo bloque en el Excel tiene dos columnas con el mismo anio."""
    ruta = Path("migration/bloques_parseados.json")
    if not ruta.exists():
        return set()
    d = json.loads(ruta.read_text(encoding="utf-8"))
    return {b["nombre"] for b in d["ok"] + d["revision"]
            if b.get("cols_duplicadas") and b.get("nombre")}


def anios_del_item(item):
    a = {e["anio"] for e in item.get("escalones") or []}
    a |= {m["anio"] for m in item.get("minimos") or []}
    a |= {t["anio"] for t in item.get("tarifasFijas") or []}
    return a


def main():
    aplicar = "--aplicar" in sys.argv
    incluir_ambiguos = "--incluir-ambiguos" in sys.argv
    corte = None
    if "--ultimo-anio" in sys.argv:
        corte = int(sys.argv[sys.argv.index("--ultimo-anio") + 1])

    st, login = http("POST", "auth/login", {"username": ADMIN_USER, "password": ADMIN_PASS})
    if st not in (200, 201):
        raise SystemExit(f"ERROR login: {st} {login}")
    token = login["accessToken"]

    # Todos los contratos, con su detalle (escalones/minimos por anio).
    contratos, page = [], 1
    while True:
        st, res = http("GET", f"contratos?limit=100&page={page}", token=token)
        contratos += res["data"]
        if page >= res["totalPages"]:
            break
        page += 1

    ambiguos = nombres_con_anio_ambiguo()
    por_cliente = {}  # cliente_id -> {"nombre","nit","anios":set,"contratos":[str]}
    for c in contratos:
        st, full = http("GET", f"contratos/{c['id']}", token=token)
        anios = set()
        for it in full.get("items") or []:
            anios |= anios_del_item(it)
        cli = full["cliente"]
        d = por_cliente.setdefault(cli["id"], {"nombre": cli["razonSocial"], "nit": cli["nit"],
                                               "anios": set(), "contratos": [], "estado": cli["estado"]})
        d["anios"] |= anios
        d["contratos"].append(full["nombreContrato"])

    vigentes, sin_2026, protegidos = [], [], []
    for cid, d in por_cliente.items():
        if ANIO in d["anios"]:
            vigentes.append((cid, d))
        elif any(n in (d["nombre"] or "") or (d["nombre"] or "") in n for n in ambiguos):
            protegidos.append((cid, d))
        else:
            sin_2026.append((cid, d))

    if incluir_ambiguos:
        sin_2026 += protegidos
        protegidos = []

    # Limite de antiguedad: quien facturo despues del corte NO se retira, solo se
    # reporta como "pendiente de tarifa 2026".
    pendientes = []
    if corte is not None:
        recientes = [(cid, d) for cid, d in sin_2026 if d["anios"] and max(d["anios"]) > corte]
        sin_2026 = [(cid, d) for cid, d in sin_2026 if not (d["anios"] and max(d["anios"]) > corte)]
        pendientes = recientes

    out = []
    out.append("=" * 70)
    out.append(f"REVISION DE VIGENCIA {ANIO} — clientes en la plataforma")
    out.append("=" * 70)
    out.append(f"Clientes con contrato:        {len(por_cliente)}")
    out.append(f"  CON tarifa {ANIO} (se quedan):  {len(vigentes)}")
    out.append(f"  SIN tarifa {ANIO} (baja):       {len(sin_2026)}")
    if corte is not None:
        out.append(f"  Sin {ANIO} pero recientes:     {len(pendientes)}  (facturaron despues de {corte}, NO se tocan)")
    out.append(f"  Protegidos (anio ambiguo):   {len(protegidos)}")
    out.append(f"Corte: {'ultima tarifa <= ' + str(corte) if corte is not None else 'sin corte (cualquier cliente sin ' + str(ANIO) + ')'}")
    out.append(f"Modo: {'APLICAR baja logica' if aplicar else 'SOLO REPORTE'}")
    out.append("")

    if pendientes:
        out.append(f"----- NO SE TOCAN ({len(pendientes)}) — activos despues de {corte}, falta cargar {ANIO} -----")
        for cid, d in sorted(pendientes, key=lambda x: x[1]["nombre"]):
            out.append(f"  {d['nombre'][:48]:<48} NIT={d['nit']:<14} ultimo anio={max(d['anios'])}")
        out.append("")

    out.append(f"----- SE DAN DE BAJA ({len(sin_2026)}) — sin tarifa {ANIO} -----")
    for cid, d in sorted(sin_2026, key=lambda x: x[1]["nombre"]):
        ult = max(d["anios"]) if d["anios"] else "-"
        out.append(f"  {d['nombre'][:48]:<48} NIT={d['nit']:<14} ultimo anio={ult}")

    if protegidos:
        out.append("")
        out.append(f"----- NO SE TOCAN ({len(protegidos)}) — el Excel tiene el anio mal rotulado -----")
        out.append("  Su bloque trae dos columnas con el mismo anio: la 2a es casi seguro 2026.")
        out.append("  Falta 2026 por un defecto de la hoja, no porque el cliente este inactivo.")
        for cid, d in sorted(protegidos, key=lambda x: x[1]["nombre"]):
            out.append(f"  {d['nombre'][:48]:<48} NIT={d['nit']:<14} anios={sorted(d['anios'])}")

    out.append("")
    out.append(f"----- SE QUEDAN ({len(vigentes)}) — con tarifa {ANIO} -----")
    for cid, d in sorted(vigentes, key=lambda x: x[1]["nombre"]):
        out.append(f"  {d['nombre'][:48]:<48} NIT={d['nit']}")

    if aplicar:
        okc, err = 0, []
        for cid, d in sin_2026:
            if d["estado"] == "retirado":
                continue
            st, res = http("PATCH", f"clientes/{cid}", {"estado": "retirado"}, token=token)
            if st in (200, 201):
                okc += 1
            else:
                err.append((d["nombre"], f"HTTP {st}: {res}"))
        out.append("")
        out.append(f"----- BAJA APLICADA -----")
        out.append(f"  Marcados 'retirado': {okc}")
        if err:
            out.append(f"  Con error: {len(err)}")
            out.extend(f"    {n} -> {m}" for n, m in err)

    texto = "\n".join(out)
    print(texto)
    Path("migration/reporte_vigencia_2026.txt").write_text(texto, encoding="utf-8")


if __name__ == "__main__":
    main()
