"""
Simulacion de pre-liquidado a partir de datos REALES de operacion (BigQuery).

Fuente: transfiriendocolombia.Monitoreo_Transacciones.Final_View-Consolidate
(vista a nivel transaccion: Fecha, Vertical, NIT, CLIENTE, Servicio, Cantidad).

Para el periodo dado, agrega Cantidad por NIT+Servicio (solo Vertical='Factura',
que es el producto IFACTURA), mapea Servicio -> concepto de la plataforma, y
carga el volumen via /volumenes/ingesta + /pre-liquidados/calcular -- el MISMO
motor de calculo ya probado (7 pruebas unitarias), no se reimplementa la
cascada tributaria aqui. El pre-liquidado queda en estado 'calculado', sin
aprobar: es una simulacion, no factura nada.

Mapeo Servicio->concepto validado contra la columna REFERENCIA de la hoja
MATRIZ FACTURACION ('IFACTURA - Emision' / 'IFACTURA - Recepcion'): cada
servicio se liquida de forma INDEPENDIENTE contra su propio contrato/tarifa,
no se suman entre si. iFactura-DocSoporte / iFactura-Nomina no tienen concepto
ni tarifa en ningun lado (ni en la plataforma ni en el Excel) -> se excluyen y
se reportan, no se inventa una tarifa para ellos.

Salvaguarda: solo se cruzan clientes con estado='activo' y NIT real (no
'PEND-'). Un cliente retirado con volumen real en BigQuery este periodo se
reporta aparte (revisar si la baja fue correcta), pero NO se le carga volumen
-- cargarlo re-activaria por la puerta de atras una baja ya decidida.

Uso:
  export GOOGLE_APPLICATION_CREDENTIALS=".../cflorez.json"
  python migration/simular_preliquidacion_bigquery.py --anio 2026 --mes 6
"""
import argparse
import json
import os
import time
import urllib.request
import urllib.error
import collections
from pathlib import Path

from google.cloud import bigquery

API = os.environ.get("COE_API", "http://localhost:3000/api")
ADMIN_USER, ADMIN_PASS = "admin", "Admin123*"
PRODUCTO_CODIGO = "IFACTURA"
BQ_PROJECT = "transfiriendocolombia"
BQ_TABLA = "transfiriendocolombia.Monitoreo_Transacciones.Final_View-Consolidate"
SA_KEY_DEFAULT = r"T:\9. Gestion Tecnologica\9.4 Data\2. Confidencial\keys\cflorez.json"

# Validado contra REFERENCIA de la hoja MATRIZ FACTURACION: cada servicio se
# liquida de forma independiente, contra su propio contrato_item/tarifa.
SERVICIO_A_CONCEPTO = {
    "iFactura-Emision": "EMISION",
    "iFactura-Recepcion": "RECEPCION",
}


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


def obtener_volumenes_bq(anio, mes, sa_key):
    os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", sa_key)
    client = bigquery.Client(project=BQ_PROJECT)
    periodo = f"{anio:04d}-{mes:02d}"
    query = f"""
        SELECT NIT, CLIENTE, Servicio, SUM(Cantidad) AS cantidad
        FROM `{BQ_TABLA}`
        WHERE Vertical = 'Factura'
          AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', Fecha)) = '{periodo}'
        GROUP BY NIT, CLIENTE, Servicio
    """
    return list(client.query(query).result())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--anio", type=int, required=True)
    ap.add_argument("--mes", type=int, required=True)
    ap.add_argument("--sa-key", default=os.environ.get("BQ_SA_KEY", SA_KEY_DEFAULT))
    args = ap.parse_args()
    anio, mes = args.anio, args.mes

    print(f"Consultando BigQuery ({BQ_TABLA}) para {anio:04d}-{mes:02d}...")
    filas = obtener_volumenes_bq(anio, mes, args.sa_key)
    print(f"  {len(filas)} combinaciones NIT+Servicio encontradas (Vertical=Factura).")

    excluidos_servicio = collections.defaultdict(int)  # servicio -> cantidad total
    excluidos_servicio_clientes = collections.defaultdict(set)
    por_nit = collections.defaultdict(dict)  # nit -> {concepto: cantidad}
    nombre_por_nit = {}
    for f in filas:
        nombre_por_nit[f["NIT"]] = f["CLIENTE"]
        concepto = SERVICIO_A_CONCEPTO.get(f["Servicio"])
        if concepto is None:
            excluidos_servicio[f["Servicio"] or "(vacio)"] += f["cantidad"]
            excluidos_servicio_clientes[f["Servicio"] or "(vacio)"].add(f["NIT"])
            continue
        por_nit[f["NIT"]][concepto] = por_nit[f["NIT"]].get(concepto, 0) + f["cantidad"]

    st, login = http("POST", "auth/login", {"username": ADMIN_USER, "password": ADMIN_PASS})
    if st not in (200, 201):
        raise SystemExit(f"ERROR login: {st} {login}")
    token = login["accessToken"]

    clientes = []
    p = 1
    while True:
        r = http("GET", f"clientes?limit=100&page={p}", token=token)[1]
        clientes += r["data"]
        if p >= r["totalPages"]:
            break
        p += 1
    activos_reales = {c["nit"]: c for c in clientes if c["estado"] == "activo" and not c["nit"].startswith("PEND-")}
    retirados_por_nit = {c["nit"]: c for c in clientes if c["estado"] == "retirado"}

    # Salvaguarda: no reactivar por la puerta de atras una baja ya decidida.
    retirados_con_volumen = [nit for nit in por_nit if nit in retirados_por_nit]

    items = []
    sin_cliente = []
    for nit, conceptos in por_nit.items():
        if nit not in activos_reales:
            if nit not in retirados_por_nit:
                sin_cliente.append((nit, nombre_por_nit.get(nit, ""), sum(conceptos.values())))
            continue
        for concepto, cantidad in conceptos.items():
            items.append({
                "nit": nit, "productoCodigo": PRODUCTO_CODIGO, "conceptoCodigo": concepto,
                "anio": anio, "mes": mes, "cantidad": int(cantidad),
                "origen": f"BigQuery {BQ_TABLA} ({anio:04d}-{mes:02d})",
            })

    print(f"  Volumenes a cargar (clientes activos, NIT real): {len(items)}")
    print(f"  Clientes retirados CON volumen real este periodo (NO se cargan): {len(retirados_con_volumen)}")
    print(f"  NIT sin cliente en la plataforma: {len(sin_cliente)}")

    CHUNK = 100
    ingesta_total = {"procesados": 0, "insertados": 0, "actualizados": 0, "omitidos": []}
    for i in range(0, len(items), CHUNK):
        st, res = http("POST", "volumenes/ingesta", {"items": items[i:i + CHUNK]}, token=token)
        if st not in (200, 201):
            raise SystemExit(f"ERROR ingesta: {st} {res}")
        for k in ("procesados", "insertados", "actualizados"):
            ingesta_total[k] += res[k]
        ingesta_total["omitidos"] += res["omitidos"]

    print("Calculando el periodo (motor real, sin aprobar)...")
    st, calculo = http("POST", "pre-liquidados/calcular", {"anio": anio, "mes": mes}, token=token)
    if st not in (200, 201):
        raise SystemExit(f"ERROR calculo: {st} {calculo}")

    pre = []
    p = 1
    while True:
        r = http("GET", f"pre-liquidados?anio={anio}&mes={mes}&limit=100&page={p}", token=token)[1]
        pre += r["data"]
        if p >= r["totalPages"]:
            break
        p += 1

    total_subtotal = sum(x["subtotal"] for x in pre)
    total_iva = sum(x["iva"] for x in pre)
    total_cartera = sum(x["valorCartera"] for x in pre)
    con_anomalia = [x for x in pre if x["anomalias"]]

    out = []
    out.append("=" * 70)
    out.append(f"SIMULACION DE PRE-LIQUIDADO desde BigQuery — periodo {anio:04d}-{mes:02d}")
    out.append(f"Fuente: {BQ_TABLA}")
    out.append("=" * 70)
    out.append(f"Combinaciones NIT+Servicio en BigQuery (Vertical=Factura): {len(filas)}")
    out.append(f"Volumenes cargados (ingesta):    insertados={ingesta_total['insertados']} actualizados={ingesta_total['actualizados']}")
    out.append(f"Pre-liquidados calculados:       {calculo['calculados']}")
    out.append(f"Pre-liquidados con error:        {len(calculo['errores'])}")
    out.append(f"Total pre-liquidados en el periodo (acumulado, incl. previos): {len(pre)}")
    out.append("")
    out.append(f"Subtotal simulado:   $ {total_subtotal:,.2f}")
    out.append(f"IVA simulado:        $ {total_iva:,.2f}")
    out.append(f"Valor cartera:       $ {total_cartera:,.2f}")
    out.append(f"Con anomalia (ej. volumen cero): {len(con_anomalia)}")
    out.append("")

    if calculo["errores"]:
        out.append(f"----- ERRORES DE CALCULO ({len(calculo['errores'])}) -----")
        for e in calculo["errores"]:
            out.append(f"  {e['cliente']} (item {e['item']}) -> {e['motivo']}")
        out.append("")

    out.append(f"----- EXCLUIDOS: servicio sin concepto en la plataforma ({sum(excluidos_servicio.values())} documentos) -----")
    out.append("  (iFactura-DocSoporte / iFactura-Nomina: no tienen tarifa en la plataforma NI en el Excel fuente)")
    for serv, cant in sorted(excluidos_servicio.items(), key=lambda x: -x[1]):
        out.append(f"  {serv:<25} {cant:>10,} documentos, {len(excluidos_servicio_clientes[serv])} clientes")
    out.append("")

    if retirados_con_volumen:
        out.append(f"----- REVISAR: clientes RETIRADOS con volumen real este periodo ({len(retirados_con_volumen)}) -----")
        out.append("  Tienen operacion real en BigQuery pero estan dados de baja en la plataforma.")
        out.append("  NO se les cargo volumen (para no reactivar la baja por la puerta de atras).")
        for nit in retirados_con_volumen:
            out.append(f"  {retirados_por_nit[nit]['razonSocial']:<45} NIT={nit} vol={sum(por_nit[nit].values()):,}")
        out.append("")

    if sin_cliente:
        out.append(f"----- NIT sin cliente en la plataforma ({len(sin_cliente)}) -----")
        for nit, nombre, cant in sorted(sin_cliente, key=lambda x: -x[2])[:40]:
            out.append(f"  {(nombre or '')[:45]:<45} NIT={nit} vol={cant:,}")
        if len(sin_cliente) > 40:
            out.append(f"  ... y {len(sin_cliente) - 40} mas")
        out.append("")

    if ingesta_total["omitidos"]:
        out.append(f"----- OMITIDOS EN LA INGESTA ({len(ingesta_total['omitidos'])}) -----")
        for o in ingesta_total["omitidos"][:40]:
            out.append(f"  {o}")

    texto = "\n".join(out)
    print(texto)
    ruta = Path(f"migration/reporte_simulacion_bigquery_{anio:04d}_{mes:02d}.txt")
    ruta.write_text(texto, encoding="utf-8")
    print(f"\nReporte escrito en {ruta}")


if __name__ == "__main__":
    main()
