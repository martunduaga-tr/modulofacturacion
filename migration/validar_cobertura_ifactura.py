"""
Validador de cobertura iFactura: produccion (BigQuery) vs contratos de Contabilidad.

Responde una sola pregunta: de los NIT que el area de Data reporta con
transacciones, cuantos tienen ya especificado contrato y cobro en
Contratos_FACTURA_estructurado.xlsx, y que le falta a cada uno.

El cruce es SOLO por NIT (columna NIT de la hoja Clientes). No hay cruce por
nombre: si un NIT no esta escrito en la hoja Clientes, cuenta como faltante.
Un cliente de grupo puede tener varios NIT en la misma celda, separados por
coma, punto y coma o barra.

Para cada NIT con volumen el resultado es uno de:
  OK                      cliente + tarifa del anio + todos sus servicios con tarifa
  NIT_SIN_CLIENTE         el NIT no esta en la hoja Clientes
  NIT_EN_VARIOS_CLIENTES  el mismo NIT esta en mas de un cliente
  CLIENTE_SIN_TARIFA      esta en Clientes pero no tiene filas en Contratos y Tarifas para el anio
  TARIFA_SIN_SERVICIO     tiene tarifa pero la columna Servicio esta vacia o no se reconoce
  SERVICIO_SIN_TARIFA     usa un servicio (ej. Nomina) que ninguna tarifa del cliente cubre
Los clientes RETIRADO se omiten: su volumen no se evalua. Si un retirado no tiene
NIT en la hoja Clientes, su NIT se pasa con --excluir (hoy: Linea Directa 811017000 y
901463197, San Rafael 860015888, Clinica Primavera 900213617).

Si la hoja "Contratos y Tarifas" trae columna NIT, la tarifa se asocia por NIT;
si una fila no tiene NIT, se asocia por el nombre del cliente en la hoja Clientes.
Ademas marca NIT_POR_CONFIRMAR cuando la columna "NIT confirmado" no dice Si.

Por defecto se evaluan las verticales Factura (Emision, Recepcion, Doc. Soporte,
Nomina) e iDocumentos (por subservicio: ANI, OTP_Email, OTP_SMS, FirmaElectronica,
CuestionarioReto). Las demas verticales quedan fuera (--verticales / --servicios).
En el contrato, "IDOCUMENTOS" a secas cubre todos los subservicios de iDocumentos;
"IDOCUMENTOS OTP_SMS" cubre solo ese.

Servicios unidos con "Y" en una misma tarifa (EMISION Y RECEPCION) comparten
tarifa: basta con que el servicio aparezca en alguna tarifa del cliente.

Uso:
  python migration/validar_cobertura_ifactura.py \
      --contratos ../contratos/Contratos_FACTURA_estructurado_con_NIT.xlsx \
      --produccion ../contratos/bq-results-*.csv --desde 2026-01 --hasta 2026-08
"""
import argparse
import re
import unicodedata
from datetime import date
from pathlib import Path

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

CARPETA = Path(__file__).resolve().parent.parent.parent / "contratos"
SERVICIOS_PROD = {  # Servicio en produccion -> palabra del contrato
    "iFactura-Emision": "EMISION",
    "iFactura-Recepcion": "RECEPCION",
    "iFactura-DocSoporte": "DOC SOPORTE",
    "iFactura-Nomina": "NOMINA",
}
PREFIJO_IDOC = "IDOCUMENTOS"


def servicio_prod(vertical, servicio, sub):
    """Nombre del servicio de produccion con la palabra que debe usar el contrato."""
    if vertical == "iDocumentos":
        return f"{PREFIJO_IDOC} {sin_tildes(sub)}" if sub else PREFIJO_IDOC
    return SERVICIOS_PROD.get(servicio, sin_tildes(servicio))


def es_conocido(p):
    return p in SERVICIOS_PROD.values() or p.startswith(PREFIJO_IDOC)


def cubierto(s, cubiertos):
    return s in cubiertos or (s.startswith(PREFIJO_IDOC) and PREFIJO_IDOC in cubiertos)
MOTIVOS = {
    "NIT_SIN_CLIENTE": "El NIT no está en la hoja Clientes: agregar el cliente con su NIT, contrato y tarifa",
    "NIT_EN_VARIOS_CLIENTES": "El NIT está en más de un cliente: dejarlo en uno solo",
    "CLIENTE_SIN_TARIFA": "El cliente no tiene filas en 'Contratos y Tarifas' para el año: cargar la tabla de tarifa",
    "TARIFA_SIN_SERVICIO": "La tarifa no dice a qué servicio aplica (columna Servicio vacía o no reconocida)",
    "SERVICIO_SIN_TARIFA": "Usa servicios que ninguna tarifa del cliente cubre",
}


def sin_tildes(s):
    return unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().upper().strip()


def nombre_clave(s):
    return " ".join(sin_tildes(s).split())


def nits_de_celda(v):
    """'900930253-1, 860002184' -> ['900930253', '860002184']. Descarta el DV."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return []
    if isinstance(v, float):
        v = str(int(v))
    out = []
    for parte in re.split(r"[,;/\n]+", str(v)):
        parte = parte.strip().split("-")[0].split(".")[0]
        dig = re.sub(r"\D", "", parte)
        if dig:
            out.append(dig)
    return out


def palabras_servicio(texto):
    """'EMISION Y RECEPCION Y DOC SOPORTE' -> {'EMISION','RECEPCION','DOC SOPORTE'}."""
    if texto is None or (isinstance(texto, float) and pd.isna(texto)) or not str(texto).strip():
        return set()
    return {nombre_clave(p) for p in re.split(r"\s+Y\s+|\s*\|\s*|\s*,\s*", sin_tildes(texto)) if p.strip()}


def resolver_produccion(patron):
    p = Path(patron)
    candidatos = sorted(p.parent.glob(p.name)) if any(c in p.name for c in "*?") else [p]
    candidatos = [c for c in candidatos if c.exists() and "_con_nombres" not in c.name] or [c for c in candidatos if c.exists()]
    if not candidatos:
        raise SystemExit(f"ERROR: no se encuentra el archivo de produccion '{patron}'")
    return max(candidatos, key=lambda c: c.stat().st_mtime)


def cargar(contratos, produccion, desde, hasta, anio, excluir, verticales, servicios):
    cli = pd.read_excel(contratos, "Clientes", dtype=object)
    cli.columns = [str(c).strip() for c in cli.columns]
    col_conf = next((c for c in cli.columns if "CONFIRMADO" in sin_tildes(c)), None)
    tar = pd.read_excel(contratos, "Contratos y Tarifas", dtype=object)
    con_nit = "NIT" in sin_tildes(tar.columns[0])
    base_cols = ["Cliente", "Transversal", "Servicio", "Anio", "Modelo", "Desde", "Hasta", "Tarifa"]
    tar.columns = (["NIT"] if con_nit else []) + base_cols + list(tar.columns[len(base_cols) + con_nit:])
    tar = tar[tar.Transversal.notna() & tar.Cliente.notna()]
    tar = tar[pd.to_numeric(tar.Anio, errors="coerce") == anio]

    # NIT -> clientes de la hoja Clientes
    nit_cli, confirmado, estado_nit, nits_nombre = {}, {}, {}, {}
    for _, r in cli.iterrows():
        if pd.isna(r.get("Nombre")):
            continue
        for n in nits_de_celda(r.get("NIT")):
            nit_cli.setdefault(n, []).append(r.Nombre)
            estado_nit.setdefault(n, []).append(sin_tildes(r.get("Estado", "")))
            if col_conf:
                confirmado[n] = sin_tildes(r.get(col_conf, "")).startswith("S")
            else:
                confirmado[n] = True  # sin columna de confirmacion: el NIT lo escribio Contabilidad
            nits_nombre.setdefault(nombre_clave(r.Nombre), []).append(n)
    nombres_cli = {nombre_clave(r.Nombre) for _, r in cli.iterrows() if pd.notna(r.get("Nombre"))}
    nombres_retirados = {nombre_clave(r.Nombre) for _, r in cli.iterrows()
                         if pd.notna(r.get("Nombre")) and sin_tildes(r.get("Estado", "")) == "RETIRADO"}

    # NIT -> servicios con tarifa del anio
    serv_nit, sin_serv_nit, tarifa_sin_cliente = {}, set(), set()
    for _, r in tar.iterrows():
        nits = nits_de_celda(r.NIT) if con_nit else []
        if not nits:
            nits = nits_nombre.get(nombre_clave(r.Cliente), [])
        if nombre_clave(r.Cliente) in nombres_retirados:
            continue  # cliente retirado: fuera del alcance
        if not nits or not any(n in nit_cli for n in nits):
            tarifa_sin_cliente.add(str(r.Cliente) + ("" if nombre_clave(r.Cliente) in nombres_cli else " (nombre no está en Clientes)") + (" (fila sin NIT)" if con_nit and not nits_de_celda(r.NIT) else ""))
            continue
        if sin_tildes(r.Modelo) == "MANTENIMIENTO":
            continue  # cargo fijo mensual: no depende de transacciones ni define servicio
        ps = palabras_servicio(r.Servicio)
        conocidos = {p for p in ps if es_conocido(p)}
        for n in nits:
            if not ps or conocidos != ps:
                sin_serv_nit.add(n)
            serv_nit.setdefault(n, set()).update(conocidos)
    tarifa_sin_cliente = sorted(tarifa_sin_cliente)

    retirados = {n for n, es in estado_nit.items() if all(e == "RETIRADO" for e in es)}
    excluir = set(excluir) | retirados
    b = pd.read_csv(produccion, dtype=str, keep_default_na=False)
    b["Cantidad"] = pd.to_numeric(b.Cantidad)
    b = b[b.Vertical.isin(verticales) & (b.Fecha.str[:7] >= desde) & (b.Fecha.str[:7] <= hasta) & ~b.NIT.isin(excluir)]
    if servicios:
        b = b[b.Servicio.isin(servicios)]
    b["serv"] = [servicio_prod(v, s_, sub) for v, s_, sub in zip(b.Vertical, b.Servicio, b.SubServicio)]
    vol = b.groupby(["NIT", "serv"]).Cantidad.sum().unstack(fill_value=0)
    nombre_prod = b[b.CLIENTE != ""].groupby("NIT").CLIENTE.last()
    # Si existe la copia con nombres completados (DATACLIENTES / web), se usan solo para mostrar
    completos = Path(produccion).with_name(Path(produccion).stem + "_con_nombres.csv")
    if completos.exists():
        extra = pd.read_csv(completos, dtype=str, keep_default_na=False, usecols=["NIT", "CLIENTE"])
        extra = extra[extra.CLIENTE != ""].groupby("NIT").CLIENTE.last()
        nombre_prod = nombre_prod.combine_first(extra)
    return dict(retirados=retirados, cli=cli, vol=vol, nombre_prod=nombre_prod, nit_cli=nit_cli, confirmado=confirmado, estado_nit=estado_nit,
                serv_nit=serv_nit, sin_serv_nit=sin_serv_nit, tarifa_sin_cliente=tarifa_sin_cliente, col_conf=col_conf)


def evaluar(d):
    filas = []
    for nit, v in d["vol"].iterrows():
        usados = {s for s, q in v.items() if q != 0}
        clientes = d["nit_cli"].get(nit, [])
        motivo, detalle, cubiertos = "OK", "", set()
        if not clientes:
            motivo = "NIT_SIN_CLIENTE"
        elif len(clientes) > 1:
            motivo, detalle = "NIT_EN_VARIOS_CLIENTES", " / ".join(clientes)
        else:
            cubiertos = d["serv_nit"].get(nit, set())
            if nit not in d["serv_nit"]:
                motivo = "CLIENTE_SIN_TARIFA"
            elif nit in d["sin_serv_nit"] and not cubiertos:
                motivo = "TARIFA_SIN_SERVICIO"
            else:
                faltan = sorted(s_ for s_ in usados if not cubierto(s_, cubiertos))
                if faltan:
                    motivo, detalle = "SERVICIO_SIN_TARIFA", "Sin tarifa: " + ", ".join(faltan)
                    if nit in d["sin_serv_nit"]:
                        detalle += " (además hay una tarifa sin servicio reconocido)"
        filas.append(dict(NIT=nit, cliente_produccion=d["nombre_prod"].get(nit, ""), cliente_contrato=" / ".join(clientes),
                          estado=" / ".join(sorted(set(d["estado_nit"].get(nit, [])))),
                          nit_confirmado="Sí" if d["confirmado"].get(nit) else ("No" if clientes else ""),
                          EMISION=v.get("EMISION", 0), RECEPCION=v.get("RECEPCION", 0), DOC_SOPORTE=v.get("DOC SOPORTE", 0), NOMINA=v.get("NOMINA", 0),
                          IDOC=sum(q for s_, q in v.items() if s_.startswith(PREFIJO_IDOC)),
                          con_tarifa=sum(q for s_, q in v.items() if cubierto(s_, cubiertos)) if motivo in ("OK", "SERVICIO_SIN_TARIFA") else 0,
                          total=v.sum(), motivo=motivo, detalle=detalle))
    return pd.DataFrame(filas).sort_values(["motivo", "total"], ascending=[True, False])


def escribir(res, d, salida, meta):
    FN = "Arial"
    H = PatternFill("solid", fgColor="2F2F2F")
    HF = Font(name=FN, bold=True, color="FFFFFF", size=10)
    thin = Side(style="thin", color="D0D0D0")
    BD = Border(left=thin, right=thin, top=thin, bottom=thin)
    base, bold = Font(name=FN, size=10), Font(name=FN, size=10, bold=True)
    NUM = "#,##0;(#,##0);-"

    def header(ws, row, cols):
        for i, (c, w) in enumerate(cols, 1):
            x = ws.cell(row, i, c)
            x.font, x.fill, x.border = HF, H, BD
            x.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
            ws.column_dimensions[get_column_letter(i)].width = w

    def put(ws, r, c, v, fmt=None, font=base):
        x = ws.cell(r, c, v)
        x.font, x.border = font, BD
        x.alignment = Alignment(vertical="top", wrap_text=True)
        if fmt:
            x.number_format = fmt
        return x

    wb = Workbook()
    ws = wb.active
    ws.title = "Resumen"
    ws.column_dimensions["A"].width = 34
    for col, w in zip("BCDE", (14, 18, 12, 80)):
        ws.column_dimensions[col].width = w
    ws["A1"] = "Validador de cobertura iFactura"
    ws["A1"].font = Font(name=FN, bold=True, size=14)
    ws["A2"] = meta
    ws["A2"].font = Font(name=FN, size=9, italic=True)
    n = len(res) + 1
    header(ws, 4, [("Resultado", 34), ("NIT", 14), ("Transacciones", 18), ("% volumen", 12), ("Qué debe hacer Contabilidad", 80)])
    motivos = ["OK"] + list(MOTIVOS)
    for i, m in enumerate(motivos, 5):
        put(ws, i, 1, m, font=bold if m == "OK" else base)
        put(ws, i, 2, f"=COUNTIF('Por NIT'!$M$2:$M${n},A{i})", "#,##0")
        put(ws, i, 3, f"=SUMIF('Por NIT'!$M$2:$M${n},A{i},'Por NIT'!$L$2:$L${n})", NUM)
        put(ws, i, 4, f"=IF($C${5 + len(motivos)}=0,0,C{i}/$C${5 + len(motivos)})", "0.0%")
        put(ws, i, 5, "Nada: listo para calcular" if m == "OK" else MOTIVOS[m])
    t = 5 + len(motivos)
    put(ws, t, 1, "Total NIT con transacciones", font=bold)
    put(ws, t, 2, f"=SUM(B5:B{t - 1})", "#,##0", bold)
    put(ws, t, 3, f"=SUM(C5:C{t - 1})", NUM, bold)
    put(ws, t, 4, f"=SUM(D5:D{t - 1})", "0.0%", bold)
    ws.cell(t + 2, 1, "Mensaje para Contabilidad").font = bold
    msg = ws.cell(t + 3, 1, f'="Faltan "&TEXT(B{t}-B5,"#,##0")&" de "&TEXT(B{t},"#,##0")&" NIT por especificar contrato y cobro ("&TEXT(1-D5,"0.0%")&" del volumen). '
                            f'Sin cliente: "&B6&" · Sin tarifa: "&B8&" · Tarifa sin servicio: "&B9&" · Servicios sin tarifa: "&B10&" · NIT repetido: "&B7&"."')
    msg.font = Font(name=FN, size=11, bold=True, color="C00000")
    msg.alignment = Alignment(wrap_text=True)
    ws.merge_cells(start_row=t + 3, start_column=1, end_row=t + 3, end_column=5)
    ws.row_dimensions[t + 3].height = 34
    ws.cell(t + 4, 1, f'="De los NIT OK, "&COUNTIFS(\'Por NIT\'!$M$2:$M${n},"OK",\'Por NIT\'!$E$2:$E${n},"No")&" tienen el NIT sin confirmar (columna \'NIT confirmado\' de la hoja Clientes)."').font = base
    ws.merge_cells(start_row=t + 4, start_column=1, end_row=t + 4, end_column=5)
    rango_j = f"'Por NIT'!$K$2:$K${n}"
    c = ws.cell(t + 5, 1, f'="Transacciones que ya se pueden calcular (servicio con tarifa): "&TEXT(SUM({rango_j}),"#,##0")&" de "&TEXT(C{t},"#,##0")'
                          f'&" ("&TEXT(IF(C{t}=0,0,SUM({rango_j})/C{t}),"0.0%")&")."')
    c.font = bold
    ws.merge_cells(start_row=t + 5, start_column=1, end_row=t + 5, end_column=5)

    w = wb.create_sheet("Por NIT")
    cols = [("NIT", 13), ("Cliente en producción", 36), ("Cliente en contrato", 32), ("Estado", 10), ("NIT confirmado", 11),
            ("Emisión", 12), ("Recepción", 12), ("Doc. Soporte", 12), ("Nómina", 10), ("iDocumentos", 12), ("Con tarifa", 13), ("Total", 13), ("Resultado", 24), ("Detalle", 60), ("Qué hacer", 60)]
    header(w, 1, cols)
    for i, r in enumerate(res.itertuples(index=False), 2):
        vals = [r.NIT, r.cliente_produccion, r.cliente_contrato, r.estado, r.nit_confirmado,
                r.EMISION, r.RECEPCION, r.DOC_SOPORTE, r.NOMINA, r.IDOC, r.con_tarifa, None, r.motivo, r.detalle,
                "Nada" if r.motivo == "OK" else MOTIVOS[r.motivo]]
        for j, v in enumerate(vals, 1):
            put(w, i, j, None if (isinstance(v, float) and pd.isna(v)) or v == "" else v, NUM if j in (6, 7, 8, 9, 10, 11, 12) else None)
        w.cell(i, 12).value = f"=SUM(F{i}:J{i})"
        w.cell(i, 1).number_format = "@"
    w.freeze_panes = "B2"
    w.auto_filter.ref = f"A1:O{n}"

    w2 = wb.create_sheet("Revisión del contrato")
    header(w2, 1, [("Revisión", 46), ("Cliente", 44), ("Detalle", 60)])
    r = 2
    con_volumen = set(res.NIT)
    for _, c in d["cli"].iterrows():
        if pd.isna(c.get("Nombre")):
            continue
        nits = nits_de_celda(c.get("NIT"))
        if not nits and sin_tildes(c.get("Estado", "")) != "RETIRADO":
            put(w2, r, 1, "Cliente activo SIN NIT válido"); put(w2, r, 2, c.Nombre); put(w2, r, 3, f"NIT: {c.get('NIT')}. Sin NIT no se le puede asignar volumen"); r += 1
        for nn in nits:
            if nn not in con_volumen and sin_tildes(c.get("Estado", "")) != "RETIRADO":
                put(w2, r, 1, "NIT sin transacciones en el período"); put(w2, r, 2, c.Nombre); put(w2, r, 3, nn); r += 1
    for nombre in d["tarifa_sin_cliente"]:
        put(w2, r, 1, "Tarifa que no se pudo asociar a un NIT de la hoja Clientes"); put(w2, r, 2, nombre); put(w2, r, 3, "Poner el NIT en la fila de tarifa o igualar el nombre con la hoja Clientes"); r += 1
    for nit, cl in sorted(d["nit_cli"].items()):
        if len(cl) > 1:
            put(w2, r, 1, "NIT repetido en la hoja Clientes"); put(w2, r, 2, " / ".join(cl)); put(w2, r, 3, nit); r += 1
    w2.freeze_panes = "A2"
    wb.save(salida)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--contratos", default=str(CARPETA / "Contratos_FACTURA_estructurado.xlsx"))
    ap.add_argument("--produccion", default=str(CARPETA / "bq-results-*.csv"))
    ap.add_argument("--desde", default="2026-01", help="mes inicial AAAA-MM")
    ap.add_argument("--hasta", default="2026-08", help="mes final AAAA-MM (usar meses cerrados)")
    ap.add_argument("--anio", type=int, default=None, help="anio de tarifa (por defecto el de --hasta)")
    ap.add_argument("--excluir", default="900032159", help="NIT a excluir separados por coma (por defecto Transfiriendo)")
    ap.add_argument("--verticales", default="Factura,iDocumentos", help="verticales de produccion a evaluar, separadas por coma")
    ap.add_argument("--servicios", default="", help="opcional: limitar a estos servicios de produccion (ej. iFactura-Emision,iFactura-Recepcion)")
    ap.add_argument("--salida", default=None)
    a = ap.parse_args()
    anio = a.anio or int(a.hasta[:4])
    prod = resolver_produccion(a.produccion)
    excluir = {x.strip() for x in a.excluir.split(",") if x.strip()}
    servicios = [x.strip() for x in a.servicios.split(",") if x.strip()]
    verticales = [x.strip() for x in a.verticales.split(",") if x.strip()]
    d = cargar(a.contratos, prod, a.desde, a.hasta, anio, excluir, verticales, servicios)
    res = evaluar(d)
    salida = a.salida or str(CARPETA.parent / f"Validador_cobertura_iFactura_{date.today():%Y-%m-%d}.xlsx")
    meta = f"Producción: {prod.name} ({a.desde} a {a.hasta}) · Contratos: {Path(a.contratos).name} · Verticales: {', '.join(verticales)}{' · Servicios: ' + ', '.join(servicios) if servicios else ''} · Tarifas año {anio} · Excluidos: {', '.join(sorted(excluir)) or 'ninguno'} + {len(d['retirados'])} NIT de clientes RETIRADO"
    escribir(res, d, salida, meta)
    tot = res.total.sum()
    falt = res[res.motivo != "OK"]
    print(meta)
    print(f"Faltan {len(falt)} de {len(res)} NIT por especificar contrato y cobro ({falt.total.sum() / tot:.1%} del volumen).")
    print(f"Transacciones que ya se pueden calcular: {res.con_tarifa.sum():,.0f} de {tot:,.0f} ({res.con_tarifa.sum() / tot:.1%}).")
    print(res.groupby("motivo").agg(nit=("NIT", "size"), transacciones=("total", "sum")).to_string())
    print(f"Reporte: {salida}")


if __name__ == "__main__":
    main()
