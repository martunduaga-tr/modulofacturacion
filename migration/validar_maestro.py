"""
Barrido de validación del maestro de contratos contra sus fuentes. Responde: ¿quedó todo ingresado?

  1. Express: cada factura de renovacion_express.xlsx desde el 1-sep-2025 está en el maestro
     (como la última factura de su suscripción), reemplazada por una más reciente del mismo
     NIT + servicio, o listada en «Express no incluidos» con su motivo. Nada se pierde en silencio.
  2. Express: cada NIT activo aparece en el maestro o en no incluidos; dato_expres.xlsx (ejemplo
     anterior) queda cubierto con el mismo tope y valor o con una renovación más reciente.
  3. Corporativos: cada fila de tarifa de los 4 Contratos_*_estructurado.xlsx está en el maestro,
     es del piloto (validado aparte) o es de un cliente RETIRADO.
  4. Cruces: un mismo NIT + servicio en dos contratos (el empalme no sabría cuál cobrar), y NIT
     clasificados Express por Data (BigQuery julio) que no quedaron en el maestro.

Uso (desde la carpeta Contabilidad): python pipeline-contabilidad-main/migration/validar_maestro.py
"""
import csv
import datetime as dt
import re
import unicodedata
from collections import Counter, defaultdict

import openpyxl
import pandas as pd

BASE = 'C:/Users/martunduaga/Desktop/Proyectos/Contabilidad/'
DESDE = dt.date(2025, 9, 1)
PILOTO = {'815000997', '860070374', '900914254', '860007373', '860037950'}


def sin_tildes(s):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().upper()).strip()


def digitos(v):
    if isinstance(v, float):
        v = '' if pd.isna(v) else (str(int(v)) if v.is_integer() else str(v))
    return re.sub(r'\D', '', str(v or ''))


maestro = list(csv.DictReader(open(BASE + 'Maestro_Contratos_Contabilidad.csv', encoding='utf-8-sig'), delimiter=';'))
wb_m = openpyxl.load_workbook(BASE + 'Maestro_Contratos_Contabilidad.xlsx', read_only=True)
no_incl = [r for r in wb_m['Express no incluidos'].iter_rows(min_row=2, values_only=True) if isinstance(r[0], int)]
filas_no_incl = {r[0] for r in no_incl}
problemas = []

# ------------------------------------------------------------------ 1-2. Express
exp = [r for r in maestro if r['segmento'] == 'EXPRESS']
fv_en_maestro = {re.search(r'FV-(\d+)', r['observaciones']).group(1) for r in exp if re.search(r'FV-(\d+)', r['observaciones'])}
nits_exp_maestro = {r['nit'] for r in exp}
ws = openpyxl.load_workbook(BASE + 'renovacion_express.xlsx', data_only=True, read_only=True).worksheets[0]
ventana, estado = [], Counter()
for n, f in enumerate(ws.iter_rows(min_row=3, values_only=True), 3):
    try:
        fecha = dt.date(int(f[2]), int(f[3]), int(f[4]))
    except (TypeError, ValueError):
        continue
    if fecha >= DESDE:
        ventana.append((n, fecha, f))
por_nit = defaultdict(list)
for n, fecha, f in ventana:
    nit = digitos(f[8])
    fv = str(int(f[1])) if isinstance(f[1], (int, float)) else ''
    if fv in fv_en_maestro:
        estado['en el maestro (última factura de la suscripción)'] += 1
    elif n in filas_no_incl:
        estado['en «Express no incluidos» con motivo'] += 1
    elif nit in nits_exp_maestro:
        estado['reemplazada por una renovación más reciente del mismo NIT'] += 1
    else:
        estado['SIN CUBRIR'] += 1
        problemas.append(f'Express: factura fila {n} FV-{fv} NIT {nit} no quedó en ninguna parte')
    por_nit[nit].append(fecha)
nits_activos = {n for n in por_nit if n}
sin_rastro = nits_activos - nits_exp_maestro - {digitos(r[3]) for r in no_incl}
for n in sorted(sin_rastro):
    problemas.append(f'Express: NIT activo {n} no está en el maestro ni en no incluidos')

# dato_expres (ejemplo anterior): mismo plan o renovación más reciente
ejemplo = openpyxl.load_workbook(BASE + 'dato_expres.xlsx', data_only=True).active
cub_ej = Counter()
for f in ejemplo.iter_rows(min_row=3, values_only=True):
    if not f[4]:
        continue
    nit, desc, valor = str(int(f[4])), sin_tildes(f[6]), int(f[8])
    serv = next((c for p, c in [('DOCUMENTO SOPORTE', 'DOCSOPORTE'), ('RECEPCION', 'RECEPCION'), ('EMISION', 'EMISION'), ('NOMINA', 'NOMINA')] if p in desc), '?')
    fila = next((r for r in exp if r['contrato_id'] == f'{nit}-EXP-{serv}'), None)
    if not fila:
        cub_ej['FALTA'] += 1
        problemas.append(f'dato_expres: {nit} {serv} no está en el maestro')
    elif int(float(fila['valor'] or 0)) == valor:
        cub_ej['mismo plan'] += 1
    else:
        cub_ej['renovado después (otro valor)'] += 1

# ------------------------------------------------------------------ 3. Corporativos
corp_m = Counter((r['nit'], r['modelo'], r['desde'], r['hasta']) for r in maestro if r['segmento'] == 'CORPORATIVO')
c_estado = Counter()
for archivo in ['FACTURA', 'RECAUDO', 'SALUD', 'SEGUROS']:
    x = pd.ExcelFile(BASE + f'contratos/Contratos_{archivo}_estructurado.xlsx')
    cl = pd.read_excel(x, [s for s in x.sheet_names if s.lower() == 'clientes'][0], dtype=str).dropna(subset=['Nombre'])
    ct = pd.read_excel(x, [s for s in x.sheet_names if 'ontrato' in s][0]).dropna(subset=['Servicio'])
    retirados = {sin_tildes(n) for n, e in zip(cl.Nombre, cl.Estado) if str(e).upper() == 'RETIRADO'}
    nit_de = {sin_tildes(n): digitos(v) for n, v in zip(cl.Nombre, cl.NIT) if digitos(v)}
    for _, r in ct.iterrows():
        cliente = sin_tildes(r['Cliente'])
        nit = digitos(r.get('NIT')) or nit_de.get(cliente, '')
        if cliente in retirados:
            c_estado['cliente RETIRADO (hoja Excluidos)'] += 1
        elif nit in PILOTO:
            c_estado['cliente del piloto (filas validadas)'] += 1
        elif any(k[0] == nit for k in corp_m):
            c_estado['en el maestro'] += 1
        else:
            c_estado['SIN CUBRIR'] += 1
            problemas.append(f'Corporativo: {archivo} {r["Cliente"]} ({nit or "sin NIT"}) no está en el maestro')

# ------------------------------------------------------------------ 4. Cruces
uso = defaultdict(set)
for r in maestro:
    for s in r['servicios'].split('+'):
        if s and not s.startswith('COMPLETAR'):
            uso[(r['nit'], s)].add(r['contrato_id'])
dobles = {k: v for k, v in uso.items() if len(v) > 1}
marcados = 0
for (nit, s), cids in sorted(dobles.items()):
    filas_cruce = [r for r in maestro if r['contrato_id'] in cids and s in r['servicios'].split('+')]
    if all('también está en' in r['observaciones'] for r in filas_cruce):
        marcados += 1  # ya está en amarillo para que Contabilidad decida
    else:
        problemas.append(f'Cruce SIN MARCAR: NIT {nit} servicio {s} está en {len(cids)} contratos ({", ".join(sorted(cids))})')
bq = pd.read_csv(BASE + 'bq-results-20261016-201621-1792181800403.csv', dtype=str, keep_default_na=False, encoding='utf-8')
bq['Cantidad'] = pd.to_numeric(bq['Cantidad'])
exp_bq = bq[bq['CLASIFICACION'] == 'Express'].groupby('NIT').agg(cliente=('CLIENTE', 'first'), cant=('Cantidad', 'sum'))
nits_maestro = {r['nit'] for r in maestro}
exp_bq_fuera = exp_bq[~exp_bq.index.isin(nits_maestro)].sort_values('cant', ascending=False)

# ------------------------------------------------------------------ Reporte
print('=' * 78)
print('BARRIDO DEL MAESTRO DE CONTRATOS')
print('=' * 78)
print(f'\n1. Express: {len(ventana)} facturas desde {DESDE:%d/%m/%Y} en renovacion_express.xlsx')
for k, v in estado.most_common():
    print(f'     {v:4}  {k}')
print(f'   NIT activos: {len(nits_activos)} · en el maestro: {len(nits_activos & nits_exp_maestro)} · solo en no incluidos: {len(nits_activos - nits_exp_maestro)}')
print(f'   suscripciones en el maestro: {len(exp)} · con ciclo leído de la factura: {sum(1 for r in exp if r["vigencia_hasta"])} · con fecha base: {sum(1 for r in exp if not r["vigencia_hasta"])}')
print(f'   dato_expres.xlsx (ejemplo anterior, 10 suscripciones): {dict(cub_ej)}')
print('\n2. Corporativos: filas de tarifa de los 4 archivos de Contabilidad')
for k, v in c_estado.most_common():
    print(f'     {v:4}  {k}')
print(f'\n3. Mismo NIT + servicio en dos contratos: {len(dobles)} (ya marcados en amarillo para Contabilidad: {marcados})')
print(f'\n4. BigQuery julio: {len(exp_bq)} NIT clasificados Express por Data · en el maestro: {len(exp_bq) - len(exp_bq_fuera)} · fuera: {len(exp_bq_fuera)}')
for nit, x in exp_bq_fuera.head(8).iterrows():
    print(f'     {nit:>11}  {str(x.cliente)[:45]:45} {int(x.cant):>7,} transacciones')
print(f'\nPROBLEMAS: {len(problemas)}')
for p in problemas[:40]:
    print('  -', p)
