"""
Parser/dry-run de la hoja CONTRATOS COE (producto iFactura) -> reporte de migracion.

NO escribe en la base de datos. Solo detecta bloques, los clasifica (OK / requiere
revision), cruza el NIT contra la hoja MATRIZ FACTURACION y verifica contra valores
conocidos. La carga real va en un segundo paso, una vez revisado este reporte.

Uso:  python migration/parse_contratos_coe.py
"""
import sys
import re
import unicodedata
import json
from pathlib import Path

import openpyxl
from openpyxl.utils import get_column_letter

from fuente import excel_matriz

ARCHIVO = excel_matriz()
HOJA_TARIFAS = "CONTRATOS COE "
HOJA_MATRIZ = "MATRIZ FACTURACION"
PRODUCTO = "IFACTURA"

KEYWORDS = {
    "DE", "HASTA", "VALOR", "PRECIO", "IFACTURA", "ANO", "AÑO", "INCREMENTO",
    "MINIMO GARANTIZADO", "IPC", "PRECIO ", "VALOR ",
}
NOTAS_REVISION = ("retirad", "no habilitad", "no se usa", "no usar", "ya no")


def norm(s):
    if s is None:
        return ""
    s = str(s).strip()
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s).upper()


def es_anio(v):
    try:
        n = int(v)
        return 2010 <= n <= 2035
    except (TypeError, ValueError):
        return False


def es_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def cargar_grid(ws):
    """Carga la hoja completa a una matriz [fila][col] 0-based."""
    filas = list(ws.iter_rows(values_only=True))
    maxc = max((len(f) for f in filas), default=0)
    return [[(f[c] if c < len(f) else None) for c in range(maxc)] for f in filas], maxc


def indice_nit(wb):
    """name(normalizado) -> nit desde MATRIZ FACTURACION."""
    ws = wb[HOJA_MATRIZ]
    grid, _ = cargar_grid(ws)
    # Detectar columnas NIT y TERCERO por cabecera (fila 5 aprox.)
    nit_col = tercero_col = None
    for r in range(0, min(8, len(grid))):
        for c, val in enumerate(grid[r]):
            n = norm(val)
            if n == "NIT":
                nit_col = c
            elif n == "TERCERO":
                tercero_col = c
        if nit_col is not None and tercero_col is not None:
            break
    idx = {}
    if nit_col is None or tercero_col is None:
        return idx
    for r in range(len(grid)):
        nit = grid[r][nit_col]
        nombre = grid[r][tercero_col]
        if nit and nombre:
            idx[norm(nombre)] = str(int(nit)) if es_num(nit) else str(nit).strip()
    return idx


def resolver_nit(nombre, idx):
    n = norm(nombre)
    if n in idx:
        return idx[n], "exacto"
    # contains: el nombre del bloque es prefijo del tercero o viceversa
    for k, v in idx.items():
        if n and (k.startswith(n) or n.startswith(k)):
            return v, "parcial"
    for k, v in idx.items():
        if n and len(n) >= 6 and n in k:
            return v, "parcial"
    return None, "no_encontrado"


def detectar_headers(grid, maxc):
    """Devuelve [(row, de_col)] de cada tabla DE/HASTA."""
    headers = []
    for r in range(len(grid)):
        for c in range(maxc - 1):
            if norm(grid[r][c]) == "DE" and norm(grid[r][c + 1]) == "HASTA":
                headers.append((r, c))
    return headers


def buscar_nombre(grid, header_row, de_col):
    """Nombre del cliente: texto no-keyword arriba-izquierda del header."""
    candidatos = []
    for r in range(max(0, header_row - 9), header_row):
        for c in range(max(0, de_col - 2), de_col + 1):
            v = grid[r][c]
            if v is None or es_num(v):
                continue
            n = norm(v)
            if not n or n in KEYWORDS:
                continue
            if any(k in n for k in ("PRECIO", "INCREMENTO", "MINIMO", "IFACTURA")):
                continue
            if re.fullmatch(r"A.?O", n):  # AÑO con cualquier codificacion
                continue
            candidatos.append((r, c, str(v).strip()))
    if not candidatos:
        return None
    candidatos.sort(key=lambda x: (x[0], x[1]))
    return candidatos[0][2]


def columnas_precio(grid, header_row, de_col, right_bound):
    """Columnas con precio: (col, anio). Busca el anio en filas sobre el header.

    Si dos columnas traen el MISMO anio (encabezado sin actualizar en el Excel: la
    columna nueva se copio con el rotulo del anio anterior), se conserva solo la
    PRIMERA. La segunda se devuelve aparte para reportarla: cargarla sobrescribiria
    el precio del anio con un valor que no le corresponde.
    """
    cols = []
    duplicadas = []
    hasta_col = de_col + 1
    vistos = set()
    for c in range(hasta_col + 1, right_bound):
        anio = None
        for r in range(max(0, header_row - 8), header_row + 1):
            if es_anio(grid[r][c]):
                anio = int(grid[r][c])
                break
        if anio is None:
            continue
        if anio in vistos:
            duplicadas.append((c, anio))
            continue
        vistos.add(anio)
        cols.append((c, anio))
    return cols, duplicadas


def detectar_concepto(grid, header_row, de_col, right_bound):
    """EMISION / RECEPCION si esta etiquetado en el bloque; por defecto EMISION."""
    for r in range(max(0, header_row - 8), header_row + 2):
        for c in range(max(0, de_col - 2), right_bound):
            n = norm(grid[r][c])
            if "RECEPCION" in n:
                return "RECEPCION"
            if "EMISION" in n:
                return "EMISION"
    return "EMISION"


def parse_bloque(grid, header_row, de_col, right_bound):
    de = de_col
    hasta = de_col + 1
    nombre = buscar_nombre(grid, header_row, de_col)
    concepto = detectar_concepto(grid, header_row, de_col, right_bound)
    pcols, cols_dup = columnas_precio(grid, header_row, de_col, right_bound)

    escalones = []  # (desde, hasta, {anio:precio})
    minimos = {}    # anio: valor
    modelo = "volumen_escalonado"
    motivos = []

    r = header_row + 1
    while r < len(grid):
        vde = grid[r][de]
        et = norm(grid[r][de])
        if "MINIMO" in et:
            modelo = "minimo_garantizado"
            aqui = {anio: float(grid[r][c]) for c, anio in pcols if es_num(grid[r][c])}
            if aqui:
                minimos.update(aqui)
                r += 1
            elif r + 1 < len(grid):
                # patron etiqueta-arriba: los valores estan en la fila siguiente
                # (suele venir como un pseudo-escalon DE=0/HASTA=1000 con valores altos)
                sig = {anio: float(grid[r + 1][c]) for c, anio in pcols if es_num(grid[r + 1][c])}
                if sig:
                    minimos.update(sig)
                    r += 2
                else:
                    r += 1
            else:
                r += 1
            continue
        if not es_num(vde):
            # fin de la tabla si ya hubo escalones; si no, seguimos un par de filas
            if escalones or et == "":
                if et == "" and not escalones:
                    r += 1
                    if r - header_row > 6:
                        break
                    continue
                break
            break
        vh = grid[r][hasta]
        precios = {anio: float(grid[r][c]) for c, anio in pcols if es_num(grid[r][c])}
        escalones.append((int(vde), int(vh) if es_num(vh) else None, precios))
        r += 1

    return {
        "nombre": nombre,
        "concepto": concepto,
        "modelo": modelo,
        "anios": sorted({a for _, _, p in escalones for a in p} | set(minimos)),
        "escalones": escalones,
        "minimos": minimos,
        "header_row": header_row + 1,  # 1-based para reporte
        "de_col": de_col,
        # Columnas con un anio ya usado: NO se cargan, se reportan para confirmar.
        "cols_duplicadas": [(get_column_letter(c + 1), a) for c, a in cols_dup],
    }


def validar(bloque):
    motivos = []
    nombre_norm = norm(bloque["nombre"])
    if bloque["nombre"] is None:
        motivos.append("sin nombre detectable")
    if any(k in nombre_norm for k in [norm(x) for x in NOTAS_REVISION]):
        motivos.append(f"nota en el nombre: '{bloque['nombre']}'")
    if not bloque["escalones"]:
        motivos.append("sin escalones")
    # precios > 0
    for d, h, p in bloque["escalones"]:
        if any(v <= 0 for v in p.values()):
            motivos.append("precio <= 0")
            break
    # solapamientos / huecos por anio
    for anio in bloque["anios"]:
        tramos = sorted([(d, h) for d, h, p in bloque["escalones"] if anio in p and h is not None])
        for i in range(1, len(tramos)):
            pd, ph = tramos[i - 1]
            cd, ch = tramos[i]
            if cd <= ph:
                motivos.append(f"{anio}: solapamiento en {cd}")
                break
            if cd != ph + 1:
                motivos.append(f"{anio}: hueco entre {ph} y {cd}")
                break
    if bloque["modelo"] == "minimo_garantizado" and not bloque["minimos"]:
        motivos.append("modelo minimo sin valores de minimo")
    return motivos


def main():
    ruta = Path(ARCHIVO)
    if not ruta.exists():
        print(f"ERROR: no se encuentra {ARCHIVO}")
        sys.exit(1)

    wb = openpyxl.load_workbook(ARCHIVO, read_only=True, data_only=True)
    idx_nit = indice_nit(wb)
    ws = wb[HOJA_TARIFAS]
    grid, maxc = cargar_grid(ws)

    headers = detectar_headers(grid, maxc)
    bloques = []
    for (hr, dc) in headers:
        # Ancho del bloque: hasta el siguiente header a la derecha EN LA MISMA BANDA
        # (las bandas miden ~13 filas). Si no hay vecino, ancho natural dc+12.
        cercanos = [c for (r2, c) in headers if c > dc and abs(r2 - hr) < 12]
        right = min(cercanos) if cercanos else dc + 12
        right = min(right, maxc)
        bloques.append(parse_bloque(grid, hr, dc, right))

    ok, revision = [], []
    for b in bloques:
        nit, tipo_match = resolver_nit(b["nombre"], idx_nit) if b["nombre"] else (None, "no_encontrado")
        b["nit"] = nit
        b["nit_match"] = tipo_match
        motivos = validar(b)
        if motivos:
            b["motivos"] = motivos
            revision.append(b)
        else:
            ok.append(b)

    # ---- Reporte ----
    out = []
    out.append("=" * 70)
    out.append(f"REPORTE DE MIGRACION (DRY-RUN) — {ARCHIVO}")
    out.append(f"Producto: {PRODUCTO}   Hoja: {HOJA_TARIFAS!r}")
    out.append("=" * 70)
    out.append(f"Bloques detectados:   {len(bloques)}")
    out.append(f"Migrables OK:         {len(ok)}")
    out.append(f"Requieren revision:   {len(revision)}")
    sin_nit = [b for b in bloques if not b['nit']]
    out.append(f"Sin NIT resuelto:     {len(sin_nit)}")
    out.append("")
    out.append("----- OK (listos para cargar) -----")
    for b in sorted(ok, key=lambda x: (str(x["nombre"]), x["concepto"])):
        anios = ",".join(map(str, b["anios"]))
        out.append(f"  [{b['modelo'][:7]}/{b['concepto'][:4]}] {b['nombre']}  | NIT={b['nit'] or '-'}({b['nit_match']}) "
                   f"| {len(b['escalones'])} esc | anios: {anios}")
    out.append("")
    out.append("----- REQUIEREN REVISION -----")
    for b in sorted(revision, key=lambda x: str(x["nombre"])):
        out.append(f"  {b['nombre']!r} (fila ~{b['header_row']}) -> {'; '.join(b['motivos'])}")
    out.append("")

    con_dup = [b for b in bloques if b["cols_duplicadas"]]
    if con_dup:
        out.append("----- COLUMNAS DE ANIO AMBIGUO — CONFIRMAR CON CONTABILIDAD -----")
        out.append("  Dos columnas del bloque traen el MISMO anio en el encabezado. Se carga solo")
        out.append("  la primera; la segunda NO se carga (probablemente es el anio siguiente con el")
        out.append("  rotulo sin actualizar, pero adivinarlo pondria un precio erroneo en una factura).")
        for b in sorted(con_dup, key=lambda x: str(x["nombre"])):
            cols = ", ".join(f"col {c} rotulada {a} -> ¿es {a + 1}?" for c, a in b["cols_duplicadas"])
            out.append(f"  {b['nombre']!r} (fila ~{b['header_row']}): {cols}")
        out.append("")

    texto = "\n".join(out)
    print(texto)
    Path("migration/reporte_migracion.txt").write_text(texto, encoding="utf-8")

    # Volcado estructurado para el cargador del paso 2
    dump = {"ok": [serial(b) for b in ok], "revision": [serial(b) for b in revision]}
    Path("migration/bloques_parseados.json").write_text(
        json.dumps(dump, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def serial(b):
    return {
        "nombre": b["nombre"], "concepto": b["concepto"], "nit": b["nit"], "nit_match": b["nit_match"],
        "modelo": b["modelo"], "anios": b["anios"],
        "escalones": [{"desde": d, "hasta": h, "precios": p} for d, h, p in b["escalones"]],
        "minimos": b["minimos"], "header_row": b["header_row"],
        "cols_duplicadas": b["cols_duplicadas"],
        "motivos": b.get("motivos", []),
    }


if __name__ == "__main__":
    main()
