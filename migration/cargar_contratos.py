"""
Cargador de la migracion CONTRATOS COE (iFactura) -> API.

Lee migration/bloques_parseados.json (los bloques OK del parser) y los carga via
la API REST, que aplica toda la validacion y auditoria. Idempotente: re-correrlo
no duplica. Un contrato por bloque (tabla de tarifa); EMISION y RECEPCION quedan
como contratos separados del mismo cliente.

Clientes sin NIT: se crea un NIT placeholder 'PEND-<hash>' + observacion para que
Contabilidad lo corrija despues.

Uso:  python migration/cargar_contratos.py
Requiere la API levantada en http://localhost:3000 y el admin sembrado.
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
PRODUCTO_CODIGO = "IFACTURA"


def http(method, path, body=None, token=None, intentos=5):
    """Llamada a la API. Reintenta los cortes de red con espera creciente.

    Contra localhost esto sobraba, pero apuntando a la API desplegada la corrida
    son cientos de peticiones y un reset transitorio abortaba la migracion a la
    mitad. Los errores HTTP (4xx/5xx) NO se reintentan: son respuesta del servidor
    y el reporte debe verlos.
    """
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


def r4(x):
    """Redondea a 4 decimales (DECIMAL(18,4))."""
    return round(float(x), 4)


def placeholder_nit(nombre):
    h = hashlib.md5(nombre.encode("utf-8")).hexdigest()[:8].upper()
    return "PEND-" + h  # 13 chars, cabe en NVARCHAR(20)


def construir_tarifas(b):
    """Construye la lista tarifas[] del item y reporta anios descartados."""
    escalones = b["escalones"]
    anios_esc = sorted({a for e in escalones for a in e["precios"]})
    tarifas = []
    descartados = []
    for anio in anios_esc:
        sa = str(anio)
        esc_anio = []
        ok = True
        for e in escalones:
            if sa in e["precios"]:
                if e["hasta"] is None:
                    ok = False
                    break
                esc_anio.append({
                    "volumenDesde": int(e["desde"]),
                    "volumenHasta": int(e["hasta"]),
                    "precioUnitario": r4(e["precios"][sa]),
                })
        if not ok or not esc_anio:
            descartados.append(anio)
            continue
        t = {"anio": anio, "escalones": esc_anio}
        if b["modelo"] == "minimo_garantizado":
            mv = b["minimos"].get(sa)
            if mv is None:
                descartados.append(anio)  # minimo requiere valor por anio
                continue
            t["valorMinimo"] = r4(mv)
        tarifas.append(t)
    return tarifas, descartados


def main():
    ruta = Path("migration/bloques_parseados.json")
    if not ruta.exists():
        print("ERROR: corre primero parse_contratos_coe.py")
        return
    todos = json.loads(ruta.read_text(encoding="utf-8"))["ok"]

    # Un cliente puede traer la MISMA tabla dos veces en la hoja (una copia vieja y
    # otra ampliada con anios nuevos). Antes se cargaba la primera que apareciera,
    # que suele ser la corta: se perdian los anios recientes. Ahora manda la mas
    # completa, y si las dos difieren en precio no se carga ninguna (elegir mal
    # pondria un precio erroneo en una factura) -> queda para Contabilidad.
    decision = clasificar_duplicados(todos)
    bloques, descartados_dup = [], []
    for b in todos:
        estado, nota = decision[id(b)]
        if estado == "OK":
            bloques.append(b)
        else:
            descartados_dup.append((f"{b['nombre']}/{b['concepto']} (fila ~{b['header_row']})",
                                    f"{estado}: {nota}"))

    # Login
    st, login = http("POST", "auth/login", {"username": ADMIN_USER, "password": ADMIN_PASS})
    if st != 200 and st != 201:
        print(f"ERROR login: {st} {login}")
        return
    token = login["accessToken"]

    # Producto IFACTURA + conceptos
    st, prods = http("GET", "productos?limit=100", token=token)
    prod = next((p for p in prods["data"] if p["codigo"] == PRODUCTO_CODIGO), None)
    if not prod:
        print("ERROR: no existe el producto IFACTURA (corre la semilla)")
        return
    st, prod_full = http("GET", f"productos/{prod['id']}", token=token)
    concepto_id = {c["codigo"]: c["id"] for c in prod_full["conceptos"]}
    if "EMISION" not in concepto_id or "RECEPCION" not in concepto_id:
        print(f"ERROR: faltan conceptos EMISION/RECEPCION en iFactura: {concepto_id}")
        return

    cache_cliente = {}      # nit -> id
    creados, saltados, fallidos, placeholders = [], [], [], 0

    def get_or_create_cliente(nit, razon, placeholder):
        if nit in cache_cliente:
            return cache_cliente[nit]
        st, res = http("GET", f"clientes?busqueda={urllib.parse.quote(nit)}&limit=20", token=token)
        existente = next((c for c in res["data"] if c["nit"] == nit), None) if res else None
        if existente:
            cache_cliente[nit] = existente["id"]
            return existente["id"]
        body = {"nit": nit, "razonSocial": razon[:255]}
        if placeholder:
            body["observaciones"] = "NIT pendiente de confirmar (migrado de CONTRATOS COE iFactura)"
        st, res = http("POST", "clientes", body, token=token)
        if st in (200, 201):
            cache_cliente[nit] = res["id"]
            return res["id"]
        # carrera/duplicado: reintentar busqueda
        st2, res2 = http("GET", f"clientes?busqueda={urllib.parse.quote(nit)}&limit=20", token=token)
        ex = next((c for c in res2["data"] if c["nit"] == nit), None) if res2 else None
        if ex:
            cache_cliente[nit] = ex["id"]
            return ex["id"]
        raise RuntimeError(f"no se pudo crear cliente {nit}: {res}")

    for b in bloques:
        nombre = (b["nombre"] or "").strip()
        if not nombre:
            fallidos.append((nombre, "sin nombre"))
            continue
        concepto = b["concepto"]
        es_placeholder = not b["nit"]
        nit = b["nit"] or placeholder_nit(nombre)
        if es_placeholder:
            placeholders += 1

        tarifas, descartados = construir_tarifas(b)
        if not tarifas:
            fallidos.append((f"{nombre}/{concepto}", f"sin anios validos (descartados: {descartados})"))
            continue

        try:
            cliente_id = get_or_create_cliente(nit, nombre, es_placeholder)
        except RuntimeError as e:
            fallidos.append((nombre, str(e)))
            continue

        nombre_contrato = f"{nombre} - {concepto} (iFactura)"[:255]

        # Idempotencia: saltar si el cliente ya tiene ese contrato
        st, cli_full = http("GET", f"clientes/{cliente_id}", token=token)
        ya = any(c["nombreContrato"] == nombre_contrato for c in (cli_full.get("contratos") or []))
        if ya:
            saltados.append(nombre_contrato)
            continue

        payload = {
            "clienteId": cliente_id,
            "nombreContrato": nombre_contrato,
            "observaciones": "Migrado de CONTRATOS COE (iFactura)"
                             + (f"; anios descartados: {descartados}" if descartados else ""),
            "items": [{
                "conceptos": [{"productoId": prod["id"], "conceptoId": concepto_id[concepto]}],
                "modeloCobro": b["modelo"],
                "tarifas": tarifas,
            }],
        }
        st, res = http("POST", "contratos", payload, token=token)
        if st in (200, 201):
            creados.append(f"{nombre_contrato} (escalones/anios: {len(tarifas)})")
        else:
            msg = res.get("message") if isinstance(res, dict) else res
            fallidos.append((nombre_contrato, f"HTTP {st}: {msg}"))

    # ---- Reporte de carga ----
    out = []
    out.append("=" * 70)
    out.append("REPORTE DE CARGA — migracion CONTRATOS COE (iFactura)")
    out.append("=" * 70)
    out.append(f"Contratos creados:        {len(creados)}")
    out.append(f"Saltados (ya existian):   {len(saltados)}")
    out.append(f"Fallidos:                 {len(fallidos)}")
    out.append(f"Clientes con NIT placeholder: {placeholders}")
    out.append(f"Descartados por tabla repetida: {len(descartados_dup)}")
    out.append("")
    out.append("----- CREADOS -----")
    out.extend("  " + c for c in sorted(creados))
    out.append("")
    out.append("----- FALLIDOS (requieren revision) -----")
    out.extend(f"  {n} -> {m}" for n, m in fallidos)
    if descartados_dup:
        out.append("")
        out.append("----- DESCARTADOS POR TABLA REPETIDA -----")
        out.append("  DUPLICADO = copia mas corta del mismo cliente (se cargo la completa).")
        out.append("  CONFLICTO = dos tablas con precios distintos; NO se carga ninguna.")
        out.extend(f"  {n} -> {m}" for n, m in sorted(descartados_dup))
    if saltados:
        out.append("")
        out.append(f"----- SALTADOS ({len(saltados)}) -----")
        out.extend("  " + s for s in sorted(saltados))

    texto = "\n".join(out)
    print(texto)
    Path("migration/reporte_carga.txt").write_text(texto, encoding="utf-8")


if __name__ == "__main__":
    main()
