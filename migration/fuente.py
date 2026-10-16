"""Resolucion del Excel de origen.

El archivo no se versiona (tiene tarifas y NITs) y su nombre cambia entre copias
("... 2.xlsx", "... 2 (1).xlsx"). Los scripts lo buscan por patron en la raiz del
proyecto en vez de codificar un nombre exacto.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PATRON = "MATRIZ DE FACTURACION*.xlsx"


def excel_matriz():
    """Ruta al Excel de la matriz de facturacion. Sale con error claro si falta."""
    candidatos = sorted(RAIZ.glob(PATRON))
    if not candidatos:
        raise SystemExit(
            f"ERROR: no se encuentra ningun '{PATRON}' en {RAIZ}.\n"
            "El Excel de origen no se versiona; copialo a la raiz del proyecto."
        )
    if len(candidatos) > 1:
        print(f"AVISO: hay {len(candidatos)} archivos que coinciden con '{PATRON}':")
        for c in candidatos:
            print(f"  - {c.name}")
        print(f"Se usa el mas reciente: {max(candidatos, key=lambda p: p.stat().st_mtime).name}")
        return max(candidatos, key=lambda p: p.stat().st_mtime)
    return candidatos[0]
