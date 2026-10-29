"""Piloto 1:1 julio 2026: BigQuery + tarifario CSV -> calculo -> comparacion con facturas emitidas."""
from decimal import Decimal as D, ROUND_HALF_UP
import pandas as pd

BASE = "C:/Users/martunduaga/Desktop/Proyectos/Contabilidad/"
peso = lambda x: x.quantize(D("1"), ROUND_HALF_UP)
cent = lambda x: x.quantize(D("0.01"), ROUND_HALF_UP)

bq = pd.read_csv(BASE + "bq-results-20261016-201621-1792181800403.csv", dtype=str, keep_default_na=False, encoding="latin-1")
bq["Cantidad"] = pd.to_numeric(bq.Cantidad)
vol = bq.groupby(["NIT", "Servicio"]).Cantidad.sum()
t = pd.read_csv(BASE + "Formato_Tarifario_Carga_Inicial.csv", sep=";", dtype=str, encoding="utf-8-sig", keep_default_na=False)

# Facturas emitidas (PDF de facturas/): subtotal de cada linea, agrupado por regla del tarifario
FACT = {
    ("815000997", "iFactura-Emision+iFactura-Recepcion+iFactura-DocSoporte"): ("FE-24395", D(1812385)),
    ("860070374", "iFactura-Emision+iFactura-DocSoporte"): ("FE-24468", D(1418850)),
    ("860070374", "iFactura-Recepcion"): ("FE-24469", D(578050)),
    ("900914254", "iFactura-Recepcion"): ("FE-24445", D(874739)),
    ("860007373", "iFactura-Emision"): ("FE-24416", D(4869096)),
    ("860037950", "ISALUD - Admin Cuentas Medicas"): ("FE-24347 l1-2", D(7128368) + D(58028397)),
    ("860037950", "iFactura-Emision"): ("FE-24347 l3", D(8763216)),
    ("860037950", "iFactura-Recepcion"): ("FE-24352", D(1327184)),
}
VOL_FACTURA = {("860037950", "ISALUD - Admin Cuentas Medicas"): 62393, ("860037950", "iFactura-Emision"): 52162}


def subtotal(g, v):
    hasta = lambda x: 10**15 if x == "" else int(float(x))
    esc = [(int(float(r.desde)), hasta(r.hasta), D(r.valor)) for r in g.itertuples() if r.modelo in ("ESCALA", "BOLSA")]
    mn = [(int(float(r.hasta)), D(r.valor)) for r in g.itertuples() if r.modelo == "MINIMO"]
    rec = sum((D(r.valor) for r in g.itertuples() if r.modelo == "RECARGO"), D(0))
    tramo = next((e for e in esc if e[0] <= v <= e[1]), None)  # bajo el minimo no hay escalon
    if (g.modelo == "BOLSA").any():
        s = tramo[2]
    elif mn and v <= mn[0][0]:
        s = mn[0][1]
    elif mn:
        s = mn[0][1] + (v - mn[0][0]) * tramo[2]
    else:
        s = v * tramo[2]
    return s + rec


filas = []
for (nit, cli, serv, modo), g in t.groupby(["nit", "razon_social", "servicios", "volumen"], sort=False):
    grupos = [serv] if modo == "CONJUNTO" else serv.split("+")
    for gs in grupos:
        v_bq = sum(int(vol.get((nit, s), 0)) for s in gs.split("+"))
        bruto = subtotal(g, v_bq)
        sub = peso(bruto)
        iva = peso(bruto * D("0.19"))
        r = g.iloc[0]
        rtefte = cent(bruto * D(r.rtefte))
        rteiva = cent(bruto * D("0.19") * D(r.rteiva))
        fac_id, fac_sub = FACT[(nit, gs)]
        v_fac = VOL_FACTURA.get((nit, gs), v_bq)
        sub_con_vol_fact = peso(subtotal(g, v_fac))
        filas.append({"cliente": cli, "servicio": gs, "factura": fac_id, "vol_bigquery": v_bq, "vol_factura": v_fac,
                      "subtotal_calculado": sub, "iva": iva, "total": sub + iva, "rtefte": rtefte, "rteiva": rteiva,
                      "subtotal_facturado": fac_sub, "diferencia": sub - fac_sub,
                      "calculo_con_vol_factura": sub_con_vol_fact, "dif_con_vol_factura": sub_con_vol_fact - fac_sub})

df = pd.DataFrame(filas)
pd.set_option("display.width", 250)
print(df.to_string(index=False))
df.to_csv(BASE + "Piloto_Comparacion_Julio2026.csv", sep=";", index=False, encoding="utf-8-sig")
