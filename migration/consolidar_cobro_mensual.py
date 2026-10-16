"""
Consolidado de cobro mensual: produccion (Data / BigQuery) + maestros y tarifas de Contabilidad.

Une en UN solo archivo, por NIT x servicio, lo que hoy esta repartido entre:
  - Produccion: export de BigQuery (Final_View-Consolidate), todas las verticales.
  - Maestro de clientes: DATACLIENTES.xlsx (hoja Hoja1) y la hoja "Clientes" de
    cada Contratos_*_estructurado.xlsx (NIT, estado ACTIVO/RETIRADO).
  - Tarifas: hoja "Contratos y Tarifas" de cada contrato (FACTURA trae NIT; RECAUDO,
    SALUD y SEGUROS ligan por nombre de cliente).

Para cada NIT x servicio asigna un estado de cobro:
  CLIENTE_CON_TARIFA  cliente activo en contrato con tarifa del anio (servicio NO verificado aun;
                      la validacion por servicio la hace validar_cobertura_ifactura.py)
  SIN_TARIFA       cliente activo en contrato pero sin tarifa del anio
  SIN_CONTRATO     el NIT esta en DATACLIENTES (se factura) pero no tiene contrato en los 4 archivos
  NO_EN_MAESTROS   el NIT tiene volumen y no aparece ni en DATACLIENTES ni en contratos
  RETIRADO         cliente marcado retirado (volumen NO se cobra; revisar si la baja es correcta)
  EXCLUIDO         NIT interno de Transfiriendo o de la lista de exclusion

El monto (subtotal, IVA, retenciones) NO se calcula aqui: lo calcula el motor del
backend (/pre-liquidados/calcular) y se carga en la columna valor_preliquidado
cuando se corre con --calcular. Aqui solo se consolida y se valida.

Salida: un Excel con hojas Resumen, Consolidado (una fila por NIT x servicio) y
Pendientes (que debe hacer cada area para destrabar el cobro).

Uso:
  python migration/consolidar_cobro_mensual.py --periodo 2026-07 \
      --produccion ../bq-results-20261008-150327-1791471821574.csv \
      --carpeta-contratos ../contratos
"""
import argparse
import re
import unicodedata
from pathlib import Path

import pandas as pd

ANIO_TARIFA_DEFAULT = None
EXCLUIR_DEFAULT = {"900032159"}  # Transfiriendo (interno)
ARCHIVOS_CONTRATO = ["FACTURA", "RECAUDO", "SALUD", "SEGUROS"]


def norm_nombre(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z0-9]+", " ", s.upper()).strip()


def solo_digitos(s):
    return re.sub(r"\D", "", str(s or ""))


def nits_de_celda(celda):
    """Una celda puede traer varios NIT separados por coma, punto y coma o barra."""
    return [d for d in (solo_digitos(x) for x in re.split(r"[,;/]", str(celda or ""))) if d]


def leer_produccion(path, periodo):
    df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8")
    df["Cantidad"] = pd.to_numeric(df["Cantidad"], errors="coerce").fillna(0)
    df["NIT"] = df["NIT"].map(solo_digitos)
    df = df[df["Fecha"].str.startswith(periodo)].copy()
    # Filas identicas en todas las columnas: se reportan aparte (Data debe confirmar si son error)
    cols = ["Fecha", "Vertical", "NIT", "CLIENTE", "EMPRESA_LIDER", "CLASIFICACION", "Servicio", "SubServicio", "Cantidad"]
    df["dup_exacto"] = df.duplicated(subset=cols, keep="first")
    return df


def leer_maestros(carpeta):
    """Devuelve dict NIT -> {estado, nombre, fuente} y el set de nombres normalizados con tarifa."""
    maestro, tarifa_nit, tarifa_nombre = {}, set(), set()
    for tipo in ARCHIVOS_CONTRATO:
        p = Path(carpeta) / f"Contratos_{tipo}_estructurado.xlsx"
        cl = pd.read_excel(p, sheet_name="Clientes", dtype=str)
        for _, r in cl.iterrows():
            for nit in nits_de_celda(r.get("NIT")):
                maestro.setdefault(nit, {"estado": str(r.get("Estado", "")).strip().upper(),
                                         "nombre": str(r.get("Nombre", "")).strip(),
                                         "fuente": f"Contratos {tipo}"})
        ct = pd.read_excel(p, sheet_name="Contratos y Tarifas", dtype=str)
        if "NIT" in ct.columns:
            for c in ct["NIT"].dropna():
                tarifa_nit.update(nits_de_celda(c))
        if "Cliente" in ct.columns:
            tarifa_nombre.update(norm_nombre(c) for c in ct["Cliente"].dropna())
    dc = pd.read_excel(Path(carpeta) / "DATACLIENTES.xlsx", sheet_name="Hoja1", dtype=str)
    dc.columns = [c.strip() for c in dc.columns]
    dc_info = {}
    for _, r in dc.iterrows():
        nit = solo_digitos(r.get("NIT"))
        if nit:
            dc_info.setdefault(nit, {"nombre": str(r.get("NOMBRE", "")).strip(),
                                     "transversal": str(r.get("TRANSVERSAL", "")).strip(),
                                     "servicios": str(r.get("SERVICIOS", "")).strip()})
    return maestro, tarifa_nit, tarifa_nombre, dc_info


def clasificar(df, maestro, tarifa_nit, tarifa_nombre, dc_info, excluir):
    agg = (df.groupby(["NIT", "Vertical", "Servicio"], as_index=False)
             .agg(cantidad=("Cantidad", "sum"),
                  filas_duplicadas=("dup_exacto", "sum"),
                  cliente_produccion=("CLIENTE", "first"),
                  empresa_lider=("EMPRESA_LIDER", "first"),
                  clasificacion=("CLASIFICACION", "first")))
    filas = []
    for _, r in agg.iterrows():
        nit = r["NIT"]
        m = maestro.get(nit)
        dc = dc_info.get(nit, {})
        nombre_cont = m["nombre"] if m else ""
        con_tarifa = nit in tarifa_nit or (m is not None and norm_nombre(m["nombre"]) in tarifa_nombre)
        if nit in excluir:
            estado, motivo = "EXCLUIDO", "NIT interno o de exclusion"
        elif r["clasificacion"] == "Cliente retirado" or (m and m["estado"] == "RETIRADO"):
            estado, motivo = "RETIRADO", "Cliente retirado: no se cobra, confirmar baja"
        elif m is None and dc:
            estado, motivo = "SIN_CONTRATO", "En DATACLIENTES (se factura) pero sin contrato en los 4 archivos"
        elif m is None:
            estado, motivo = "NO_EN_MAESTROS", "NIT no esta en DATACLIENTES ni en ningun contrato"
        elif not con_tarifa:
            estado, motivo = "SIN_TARIFA", "Cliente activo en contrato sin tarifa del anio"
        else:
            estado, motivo = "CLIENTE_CON_TARIFA", "Cliente con tarifa; falta verificar que la tarifa cubra el servicio"
        filas.append({
            "NIT": nit,
            "Cliente (produccion)": r["cliente_produccion"],
            "Cliente (contrato)": nombre_cont,
            "Cliente (DATACLIENTES)": dc.get("nombre", ""),
            "Empresa lider": r["empresa_lider"],
            "Vertical": r["Vertical"],
            "Servicio": r["Servicio"],
            "Cantidad produccion": r["cantidad"],
            "Filas duplicadas exactas": int(r["filas_duplicadas"]),
            "Fuente contrato": m["fuente"] if m else "",
            "Estado cobro": estado,
            "Motivo": motivo,
            "valor_preliquidado": None,  # lo llena el motor del backend con --calcular
        })
    return pd.DataFrame(filas)


def pendientes(cons):
    reglas = {
        "SIN_CONTRATO": ("Contabilidad", "Cargar el contrato y la tarifa del cliente en los archivos de contratos"),
        "NO_EN_MAESTROS": ("Contabilidad", "Dar de alta el NIT en DATACLIENTES o confirmar que no factura"),
        "SIN_TARIFA": ("Contabilidad", "Cargar la tarifa del anio del cliente (o confirmar el valor vigente)"),
        "RETIRADO": ("Contabilidad", "Confirmar la baja; si no es correcta, reactivar cliente en el maestro"),
    }
    filas = []
    for estado, (resp, accion) in reglas.items():
        sub = cons[cons["Estado cobro"] == estado]
        for (nit, cli), g in sub.groupby(["NIT", "Cliente (produccion)"]):
            filas.append({"Responsable": resp, "Estado": estado, "NIT": nit, "Cliente": cli,
                          "Servicios": ", ".join(sorted(g["Servicio"].unique())),
                          "Cantidad afectada": g["Cantidad produccion"].sum(), "Accion": accion})
    dups = cons[cons["Filas duplicadas exactas"] > 0]
    if len(dups):
        filas.append({"Responsable": "Data", "Estado": "DUPLICADOS", "NIT": "", "Cliente": "",
                      "Servicios": ", ".join(sorted(dups["Servicio"].unique())),
                      "Cantidad afectada": int(dups["Cantidad produccion"].sum()),
                      "Accion": "Confirmar si las filas identicas del export son duplicados del query"})
    return pd.DataFrame(filas).sort_values(["Responsable", "Cantidad afectada"], ascending=[True, False])


def resumen(cons, periodo):
    total = cons["Cantidad produccion"].sum()
    por_estado = cons.groupby("Estado cobro")["Cantidad produccion"].agg(["sum", "count"]).reset_index()
    por_estado["% volumen"] = (por_estado["sum"] / total * 100).round(2)
    por_estado.columns = ["Estado cobro", "Cantidad", "Filas NIT x servicio", "% volumen"]
    cab = pd.DataFrame([
        {"Concepto": "Periodo", "Valor": periodo},
        {"Concepto": "NIT distintos", "Valor": cons["NIT"].nunique()},
        {"Concepto": "Cantidad total produccion", "Valor": int(total)},
        {"Concepto": "Cantidad con cliente y tarifa (servicio sin verificar)", "Valor": int(cons.loc[cons["Estado cobro"] == "CLIENTE_CON_TARIFA", "Cantidad produccion"].sum())},
    ])
    return cab, por_estado


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--periodo", required=True, help="AAAA-MM, ej. 2026-07")
    ap.add_argument("--produccion", required=True, help="CSV exportado de BigQuery")
    ap.add_argument("--carpeta-contratos", required=True, help="carpeta con Contratos_*.xlsx y DATACLIENTES.xlsx")
    ap.add_argument("--excluir", default=",".join(sorted(EXCLUIR_DEFAULT)), help="NIT a excluir, separados por coma")
    ap.add_argument("--salida", default=None, help="ruta del .xlsx de salida")
    args = ap.parse_args()

    excluir = {x.strip() for x in args.excluir.split(",") if x.strip()}
    prod = leer_produccion(args.produccion, args.periodo)
    maestro, tarifa_nit, tarifa_nombre, dc_info = leer_maestros(args.carpeta_contratos)
    cons = clasificar(prod, maestro, tarifa_nit, tarifa_nombre, dc_info, excluir)
    cons = cons.sort_values(["Estado cobro", "Cantidad produccion"], ascending=[True, False])
    cab, por_estado = resumen(cons, args.periodo)
    pend = pendientes(cons)

    salida = Path(args.salida or Path(args.carpeta_contratos).parent / f"Consolidado_cobro_{args.periodo}.xlsx")
    with pd.ExcelWriter(salida, engine="openpyxl") as w:
        cab.to_excel(w, sheet_name="Resumen", index=False, startrow=0)
        por_estado.to_excel(w, sheet_name="Resumen", index=False, startrow=len(cab) + 2)
        cons.to_excel(w, sheet_name="Consolidado", index=False)
        pend.to_excel(w, sheet_name="Pendientes", index=False)
    cons.to_csv(salida.with_suffix(".csv"), index=False, encoding="utf-8-sig")
    print(f"Periodo {args.periodo}: {len(prod)} filas, {cons['NIT'].nunique()} NIT, {len(cons)} NIT x servicio")
    print(por_estado.to_string(index=False))
    print(f"Reporte: {salida}")


if __name__ == "__main__":
    main()
