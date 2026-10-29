"""
Ingesta de VOLUMENES: produccion (Data) + maestros de Contabilidad -> payload para coe.volumenes.

Flujo (todo automatico, sin pasos manuales):
  1. Lee produccion del periodo desde un CSV exportado de BigQuery (--produccion).
     La lectura directa de BigQuery NO esta escrita aun; cuando haya acceso se agrega
     como otra fuente que devuelva las mismas columnas que el CSV.
  2. CONSERVA las filas exactamente duplicadas: Data confirmo que son documentos
     distintos (Validacion_Consulta_Data_Julio2026.docx). --dedup solo para analisis.
  3. Mapea Servicio -> (producto, concepto) con MAPEO_SERVICIOS. Lo que no tiene
     mapeo NO se inventa: se reporta como SIN_CATALOGO.
  4. Hace match de cada NIT con los maestros de Contabilidad (DATACLIENTES y las hojas
     Clientes de los Contratos_*). Solo carga NIT con cliente ACTIVO y NIT real.
     Retirados no se cargan (no reactivar bajas). NIT sin maestro se reporta.
  5. Escribe `volumenes_<periodo>.json` con el mismo formato que POST /volumenes/ingesta
     y un reporte de todo lo excluido.
  6. Con --enviar, carga el payload a la API en lotes (no probado sin backend).

Uso:
  python migration/ingesta_volumenes.py --periodo 2026-07 \
      --produccion ../bq-results-20261008-150327-1791471821574.csv \
      --carpeta-contratos ../contratos
"""
import argparse
import json
from collections import defaultdict
from pathlib import Path

import pandas as pd

from consolidar_cobro_mensual import (
    EXCLUIR_DEFAULT,
    leer_maestros,
    leer_produccion,
    solo_digitos,
)

# Servicio de produccion -> (codigo producto, codigo concepto) en la plataforma.
# Solo se mapea lo que existe en 02_seed.sql (IFACTURA: EMISION, RECEPCION).
# Los demas servicios quedan SIN_CATALOGO hasta que Contabilidad confirme su producto/concepto.
MAPEO_SERVICIOS = {
    "iFactura-Emision": ("IFACTURA", "EMISION"),
    "iFactura-Recepcion": ("IFACTURA", "RECEPCION"),
}


def aplicar_dedup(df, dedup):
    if not dedup:
        return df
    return df[~df["dup_exacto"]]


def construir_payload(df, maestro, excluir, anio, mes):
    items, excl = defaultdict(float), defaultdict(lambda: {"cantidad": 0, "nits": set()})
    for _, r in df.iterrows():
        nit, serv, cant = r["NIT"], r["Servicio"], r["Cantidad"]
        m = maestro.get(nit)
        if nit in excluir:
            motivo = "EXCLUIDO"
        elif r["CLASIFICACION"] == "Cliente retirado" or (m and m["estado"] == "RETIRADO"):
            motivo = "RETIRADO"
        elif m is None:
            motivo = "SIN_MAESTRO"
        elif nit.startswith("PEND-"):
            motivo = "NIT_PENDIENTE"
        elif serv not in MAPEO_SERVICIOS:
            motivo = "SIN_CATALOGO"
        else:
            producto, concepto = MAPEO_SERVICIOS[serv]
            items[(nit, producto, concepto)] += cant
            continue
        excl[(motivo, serv)]["cantidad"] += cant
        excl[(motivo, serv)]["nits"].add(nit)

    payload = [
        {"nit": nit, "productoCodigo": prod, "conceptoCodigo": conc,
         "anio": anio, "mes": mes, "cantidad": int(round(cant)),
         "origen": f"Data {anio:04d}-{mes:02d}"}
        for (nit, prod, conc), cant in sorted(items.items())
    ]
    reporte = [
        {"motivo": motivo, "servicio": serv, "nits": len(v["nits"]), "cantidad": int(round(v["cantidad"]))}
        for (motivo, serv), v in sorted(excl.items(), key=lambda kv: -kv[1]["cantidad"])
    ]
    return payload, reporte


def validar_payload(payload):
    """Mismas reglas que IngestaVolumenesDto / VolumenItemDto del backend."""
    errores = []
    for i, it in enumerate(payload):
        if not it["nit"].isdigit():
            errores.append((i, "nit no numerico"))
        if not isinstance(it["cantidad"], int) or it["cantidad"] < 0:
            errores.append((i, "cantidad invalida"))
        if not (1 <= it["mes"] <= 12):
            errores.append((i, "mes fuera de rango"))
    return errores


def enviar(payload, api, usuario, clave, lote=100):
    import urllib.request
    import urllib.error

    def post(path, body, token=None):
        req = urllib.request.Request(api + "/" + path, data=json.dumps(body).encode("utf-8"), method="POST")
        req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", "Bearer " + token)
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))

    token = post("auth/login", {"username": usuario, "password": clave})["accessToken"]
    totales = {"procesados": 0, "insertados": 0, "actualizados": 0, "omitidos": []}
    for i in range(0, len(payload), lote):
        res = post("volumenes/ingesta", {"items": payload[i:i + lote]}, token)
        for k in ("procesados", "insertados", "actualizados"):
            totales[k] += res[k]
        totales["omitidos"] += res["omitidos"]
    return totales


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--periodo", required=True, help="AAAA-MM")
    ap.add_argument("--produccion", required=True, help="CSV de BigQuery")
    ap.add_argument("--carpeta-contratos", required=True)
    ap.add_argument("--excluir", default=",".join(sorted(EXCLUIR_DEFAULT)))
    ap.add_argument("--dedup", action="store_true",
                    help="quitar filas exactamente repetidas (NO para cobrar: son documentos distintos)")
    ap.add_argument("--salida", default=None)
    ap.add_argument("--enviar", action="store_true", help="cargar a la API (requiere backend corriendo)")
    ap.add_argument("--api", default="http://localhost:3000/api")
    ap.add_argument("--usuario", default="admin")
    ap.add_argument("--clave", default=None)
    args = ap.parse_args()

    anio, mes = map(int, args.periodo.split("-"))
    excluir = {x.strip() for x in args.excluir.split(",") if x.strip()}

    prod = leer_produccion(args.produccion, args.periodo)
    total_filas = len(prod)
    prod = aplicar_dedup(prod, dedup=args.dedup)
    maestro, _, _, _ = leer_maestros(args.carpeta_contratos)
    payload, reporte = construir_payload(prod, maestro, excluir, anio, mes)
    errores = validar_payload(payload)

    salida = Path(args.salida or Path(args.carpeta_contratos).parent / f"volumenes_{args.periodo}.json")
    salida.write_text(json.dumps({"periodo": args.periodo, "filas_produccion": total_filas,
                                  "filas_tras_dedup": len(prod), "items": payload,
                                  "excluidos": reporte}, ensure_ascii=False, indent=2), encoding="utf-8")

    cant_carga = sum(i["cantidad"] for i in payload)
    print(f"Periodo {args.periodo}: {total_filas} filas, {len(prod)} tras dedup")
    print(f"Payload: {len(payload)} items, {cant_carga:,} unidades, {len({i['nit'] for i in payload})} NIT")
    print(f"Errores de validacion: {len(errores)}")
    print("Excluidos:")
    print(pd.DataFrame(reporte).to_string(index=False))
    print(f"Archivo: {salida}")

    if args.enviar:
        if not args.clave:
            raise SystemExit("Falta --clave para enviar")
        print(enviar(payload, args.api, args.usuario, args.clave))


if __name__ == "__main__":
    main()
