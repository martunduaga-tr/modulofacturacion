"""
Genera el maestro de contratos para Contabilidad, PRELLENADO con lo que ya entregaron:

  - Corporativos: contratos/Contratos_{FACTURA,RECAUDO,SALUD,SEGUROS}_estructurado.xlsx
    (los 5 clientes del piloto conservan las filas validadas 1:1 con las facturas de julio:
     Formato_Tarifario_Carga_Inicial.csv).
  - Express: renovacion_express.xlsx (historial; activos = plan facturado desde el 1-sep-2025;
    una fila PLAN_ANUAL por NIT + servicio con su última factura).

Reglas para NO inventar datos:
  - Servicio de Contabilidad -> nombre de Data. EMISION/RECEPCION/DOC SOPORTE se traducen
    directo. Los demás solo si BigQuery (julio) confirma que ese NIT usa ese servicio; si no,
    la celda queda en amarillo con la sugerencia. Lo que no tiene equivalente en Data queda
    en amarillo con el texto original.
  - Retenciones, segmento dudoso, CONJUNTO/SEPARADO de servicios combinados: en amarillo.
  - Clientes RETIRADOS no se cargan (hoja "Excluidos").

Salida (carpeta Contabilidad):
  Maestro_Contratos_Contabilidad.xlsx  para que Contabilidad complete (formatos numéricos
                                       explícitos: Excel recorta decimales en formato General)
  Maestro_Contratos_Contabilidad.csv   misma tabla en el formato que lee el sistema

Uso: python migration/generar_maestro_contratos.py   (desde la carpeta Contabilidad)
"""
import csv
import datetime as dt
import re
import unicodedata
from collections import Counter, defaultdict

import openpyxl
import pandas as pd
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

BASE = 'C:/Users/martunduaga/Desktop/Proyectos/Contabilidad/'
BIGQUERY = BASE + 'bq-results-20261016-201621-1792181800403.csv'
COLS = ['nit', 'razon_social', 'segmento', 'contrato_id', 'vigencia_desde', 'vigencia_hasta', 'moneda', 'anio',
        'servicios', 'volumen', 'modelo', 'desde', 'hasta', 'valor', 'periodicidad', 'rtefte', 'rteiva', 'rteica',
        'observaciones']
COMPLETAR = 'COMPLETAR'
# Sin contratos firmados a la mano: todos entran con la misma fecha base y sin fin. La vigencia real
# empieza a contar cuando se registra la renovación en la plataforma.
FECHA_BASE = '2026-01-01'
PILOTO = {'815000997', '860070374', '900914254', '860007373', '860037950'}

# Servicio de Contabilidad -> servicio de Data. `directo`: siempre; `confirmar`: solo si BigQuery lo confirma.
DIRECTO = {'EMISION': 'iFactura-Emision', 'RECEPCION': 'iFactura-Recepcion', 'DOC SOPORTE': 'iFactura-DocSoporte'}
CONFIRMAR = {
    'RECAUDO SILVER': 'IRecaudo-Silver',
    'CUENTA MEDICA': 'ISALUD - Admin Cuentas Medicas',
    'CUENTAS MEDICAS': 'ISALUD - Admin Cuentas Medicas',
    'CUENTAS MEDICAS (ADMINISTRADOR CM)': 'ISALUD - Admin Cuentas Medicas',
    'SOAT': 'iSoat - Emision',
    'EMAIL': 'iSoat - Mail',
    'SMS': 'iSoat - SMS',
    'EXPEDICION': 'iSeguros - Emisión',
}
# Nombres que contienen " Y " pero son UN servicio.
COMPUESTOS = ['FIRMA DIGITAL Y QR']
# Confirmado por el usuario el 2026-10-22: el contrato corporativo de ALKA MOTOR es solo Emisión;
# Recepción, Documento soporte y Nómina son suscripciones Express (renovacion_express.xlsx).
CORRECCIONES = {
    '900188916': ('iFactura-Emision+iFactura-Recepcion', 'iFactura-Emision',
                  'contrato corporativo solo de Emisión (confirmado 22-oct-2026): Recepción, Doc. soporte y Nómina son suscripciones Express'),
}
MODELOS = {'ESCALA': 'ESCALA', 'MINIMO GARANTIZADO': 'MINIMO', 'BOLSA': 'BOLSA', 'TARIFA FIJA': 'FIJO', 'MANTENIMIENTO': 'RECARGO'}


def sin_tildes(s):
    return unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().upper().strip()


def digitos(s):
    # pandas lee la columna NIT como float si tiene celdas vacías: 860026182.0 -> "8600261820" sin esto.
    if isinstance(s, float):
        s = '' if pd.isna(s) else (str(int(s)) if s.is_integer() else str(s))
    return re.sub(r'\D', '', str(s or ''))


def normalizar_nit(nit):
    """NIT de empresa (9 dígitos) o cédula (hasta 10). Más largo -> revisar. Devuelve (nit, nota)."""
    if len(nit) > 10:
        return nit, 'NIT con más de 10 dígitos: revisar'
    return nit, ''


def num(v):
    """Valor de Excel -> texto con punto decimal y máximo 4 decimales (como lo guarda la BD)."""
    if v is None or (isinstance(v, float) and pd.isna(v)) or str(v).strip() in ('', 'EN ADELANTE'):
        return ''
    f = round(float(v), 4)
    return str(int(f)) if f == int(f) else repr(f)


def tokens(servicio):
    s = sin_tildes(servicio)
    for c in COMPUESTOS:
        s = s.replace(c, c.replace(' Y ', '~'))
    return [t.strip().replace('~', ' Y ') for t in s.split(' Y ') if t.strip()]


# ------------------------------------------------------------------ BigQuery julio (para confirmar servicios)
bq = pd.read_csv(BIGQUERY, dtype=str, keep_default_na=False, encoding='utf-8')  # el export es UTF-8 válido
bq['Cantidad'] = pd.to_numeric(bq['Cantidad'])
bq['NIT'] = bq['NIT'].map(digitos)
usa = bq.groupby('NIT')['Servicio'].agg(set).to_dict()

# ------------------------------------------------------------------ piloto (validado 1:1)
piloto = list(csv.DictReader(open(BASE + 'Formato_Tarifario_Carga_Inicial.csv', encoding='utf-8-sig'), delimiter=';'))
for r in piloto:
    r['vigencia_desde'], r['vigencia_hasta'] = FECHA_BASE, ''
    r['observaciones'] = re.sub(r'^vigencia por confirmar\.? ?', '', r['observaciones'])
    r['_falta'] = set()
    r['_auto'] = set()
    r['_origen'] = 'Piloto validado con facturas de julio'
    if r['nit'] == '900914254':
        r['segmento'] = 'CORPORATIVO'
        r['observaciones'] = 'Data la clasifica Express, pero se factura mensual con bolsa (FE-24445): confirmar segmento'
        r['_falta'].add('segmento')
    if r['nit'] == '815000997':
        r['_falta'].add('valor')
    if r['nit'] == '860037950' and r['volumen'] == 'SEPARADO':
        r['_falta'].add('volumen')
        r['observaciones'] = ('su tabla agrupa Emisión y Recepción (la regla general sería CONJUNTO), pero la factura FE-24352 de julio '
                              'cobró Recepción aparte: 6.088 × $218. Se dejó SEPARADO como en la factura; confirmar cuál es el correcto')

# ------------------------------------------------------------------ corporativos (4 archivos de Contabilidad)
corp, excluidos = [], []
for archivo in ['FACTURA', 'RECAUDO', 'SALUD', 'SEGUROS']:
    x = pd.ExcelFile(BASE + f'contratos/Contratos_{archivo}_estructurado.xlsx')
    cl = pd.read_excel(x, [s for s in x.sheet_names if s.lower() == 'clientes'][0], dtype=str).dropna(subset=['Nombre'])
    ct = pd.read_excel(x, [s for s in x.sheet_names if 'ontrato' in s][0]).dropna(subset=['Servicio'])
    estado = {sin_tildes(n): str(e).upper() for n, e in zip(cl.Nombre, cl.Estado)}
    nit_de = {sin_tildes(n): digitos(v) for n, v in zip(cl.Nombre, cl.NIT) if digitos(v)}
    nombre_de = {normalizar_nit(digitos(v))[0]: n.strip() for n, v in zip(cl.Nombre, cl.NIT) if digitos(v)}
    for _, r in ct.iterrows():
        cliente = str(r['Cliente']).strip()
        nit, nota_nit = normalizar_nit(digitos(r.get('NIT')) or nit_de.get(sin_tildes(cliente), ''))
        if estado.get(sin_tildes(cliente)) == 'RETIRADO':
            excluidos.append({'archivo': archivo, 'cliente': cliente, 'nit': nit, 'motivo': 'Cliente RETIRADO en la hoja Clientes'})
            continue
        if nit in PILOTO:
            continue  # ya viene validado del piloto
        falta, obs = set(), [nota_nit] if nota_nit else []
        if nota_nit.startswith('NIT con más'):
            falta.add('nit')
        if not nit:
            falta.add('nit')
            obs.append('sin NIT en el archivo de Contabilidad')

        servicios, moneda = [], 'COP'
        for t in tokens(r['Servicio']):
            if t == 'MANTENIMIENTO':
                continue  # el valor del mantenimiento va en su propia fila RECARGO
            if t.endswith(' - USD'):
                t, moneda = t[:-6], 'USD'
            if t in DIRECTO:
                servicios.append(DIRECTO[t])
            elif t in CONFIRMAR and CONFIRMAR[t] in usa.get(nit, set()):
                servicios.append(CONFIRMAR[t])
            else:
                falta.add('servicios')
                sug = f' (¿{CONFIRMAR[t]}? BigQuery no lo confirma para este NIT)' if t in CONFIRMAR else ' (sin equivalente en Data)'
                servicios.append(f'{COMPLETAR}: {t}')
                obs.append(f'servicio «{t}»{sug}')
        if moneda == 'USD':
            falta.add('moneda')
            obs.append('tarifa en USD: el sistema aún no la procesa')

        modelo = MODELOS.get(sin_tildes(r['Modelo']), '')
        if not modelo:
            falta.add('modelo')
            obs.append(f'modelo «{r["Modelo"]}» no reconocido')
        anio = '' if pd.isna(r.get('Año')) else str(int(float(r['Año'])))
        if not anio:
            falta.add('anio')
        desde, hasta = num(r.get('Escala (Desde)')), num(r.get('Escala (Hasta)'))
        if modelo == 'MINIMO' and not hasta:
            falta.add('hasta')
            obs.append('mínimo garantizado sin tope (hasta)')
        if modelo == 'RECARGO':
            desde = hasta = ''
        valor = num(r.get('Tarifa / Precio'))
        if not valor:
            falta.add('valor')
        transversal = sin_tildes(r.get('Transversal') or archivo)
        corp.append({
            'nit': nit, 'razon_social': nombre_de.get(nit, cliente), 'segmento': 'CORPORATIVO',
            'contrato_id': f'{nit or "SIN-NIT-" + sin_tildes(cliente).replace(" ", "-")}-{transversal}-2026',
            'vigencia_desde': FECHA_BASE, 'vigencia_hasta': '', 'moneda': moneda, 'anio': anio,
            'servicios': '+'.join(servicios), 'volumen': 'CONJUNTO', 'modelo': modelo, 'desde': desde, 'hasta': hasta,
            'valor': valor, 'periodicidad': 'MENSUAL', 'rtefte': '', 'rteiva': '', 'rteica': '',
            'observaciones': '; '.join(obs), '_falta': falta | {'rtefte', 'rteiva', 'rteica'}, '_auto': set(),
            '_origen': f'Contratos_{archivo}_estructurado.xlsx', '_menciona_mant': 'MANTENIMIENTO' in tokens(r['Servicio']),
        })

for r in corp:
    if r['nit'] in CORRECCIONES and r['servicios'] == CORRECCIONES[r['nit']][0]:
        r['servicios'] = CORRECCIONES[r['nit']][1]
        r['observaciones'] = '; '.join([o for o in [r['observaciones']] if o] + [CORRECCIONES[r['nit']][2]])

# Revisiones por contrato: servicios combinados, servicio repetido entre reglas, mantenimiento sin valor
por_contrato = defaultdict(list)
for r in corp:
    por_contrato[r['contrato_id']].append(r)
for cid, filas in por_contrato.items():
    reglas = {r['servicios'] for r in filas}
    conteo = Counter(s for regla in reglas for s in regla.split('+'))
    repetidos = {s for s, n in conteo.items() if n > 1 and not s.startswith(COMPLETAR)}
    tiene_recargo = any(r['modelo'] == 'RECARGO' for r in filas)
    tablas = defaultdict(list)
    for r in filas:
        if r['modelo'] in ('ESCALA', 'BOLSA') and r['desde']:
            tablas[(r['servicios'], r['anio'])].append(r)
    solapadas, corregidas = set(), {}
    for tabla in tablas.values():
        tabla.sort(key=lambda x: float(x['desde']))
        for a, b in zip(tabla, tabla[1:]):
            if a['hasta'] != '' and float(b['desde']) == float(a['hasta']):
                # 20.001-25.000 seguido de 25.000-…: error de digitación evidente -> 25.001 (verificar)
                corregidas[id(b)] = (b['desde'], str(int(float(a['hasta'])) + 1))
                b['desde'] = corregidas[id(b)][1]
            elif a['hasta'] == '' or float(b['desde']) <= float(a['hasta']):
                solapadas.update({id(a), id(b)})
    desde_minimo = {k: min(float(x['desde']) for x in v) for k, v in tablas.items()}
    con_tabla = {r['servicios'] for r in filas if r['modelo'] != 'RECARGO'}
    for r in filas:
        extra = []
        if r['modelo'] == 'RECARGO' and r['servicios'] not in con_tabla:
            # Un recargo se suma a una regla de cobro; sin ella es un cargo fijo mensual por sí solo
            # (ej. ALLIANZ «RECURSO HUMANO» $8.473.503).
            r['modelo'] = 'FIJO'
            r['_falta'].add('modelo')
            extra.append('mantenimiento sin tabla de cobro de los mismos servicios: se tomó como cargo FIJO mensual (confirmar)')
        if repetidos & set(r['servicios'].split('+')):
            r['_falta'].add('servicios')
            extra.append(f'{", ".join(sorted(repetidos))} aparece en más de una regla del contrato: dejar una sola')
        if id(r) in corregidas:
            r['_auto'].add('desde')
            extra.append(f'desde corregido de {corregidas[id(r)][0]} a {corregidas[id(r)][1]} (se solapaba con el escalón anterior): verificar')
        if r['modelo'] == 'MINIMO' and not r['hasta'] and desde_minimo.get((r['servicios'], r['anio'])) == 1:
            extra.append('las escalas empiezan en 1: parece un PISO (se cobra el mayor entre volumen × tarifa y el mínimo), '
                         'no una franquicia; confirmar cómo se cobra y, si es franquicia, hasta cuántas transacciones cubre')
        if id(r) in solapadas:
            r['_falta'].update({'desde', 'hasta'})
            extra.append('escalones que se solapan (un escalón empieza donde termina el anterior): corregir desde/hasta')
        if r['_menciona_mant'] and not tiene_recargo:
            extra.append('el servicio menciona MANTENIMIENTO pero no hay fila con su valor: agregar fila RECARGO si aplica')
        if extra:
            r['observaciones'] = '; '.join([o for o in [r['observaciones']] if o] + extra)

# ------------------------------------------------------------------ express (renovacion_express.xlsx)
# Historial de facturación Express. Activo = renovó (o se suscribió) desde DESDE_EXPRESS: el plan es
# anual, así que 12 meses + 1 de margen. De cada NIT + servicio se toma la ÚLTIMA factura de plan.
DESDE_EXPRESS = dt.date(2025, 9, 1)
MESES = {m: i + 1 for i, m in enumerate(['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO',
                                          'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'])}
MES_RE = '(' + '|'.join(MESES) + ')'
SERV_EXP = [  # (texto en la descripción, servicio de Data, código del contrato)
    (r'DOC(UMENTOS?)?\.? SOPORTES?', 'iFactura-DocSoporte', 'DOCSOPORTE'),
    (r'NOMINA', 'iFactura-Nomina', 'NOMINA'),
    (r'RECEPCION', 'iFactura-Recepcion', 'RECEPCION'),
    (r'EMISION', 'iFactura-Emision', 'EMISION'),
]
NO_PLAN = ['ADICON', 'ADICIONAL', 'ADIONAL', 'CAPACITACION', 'PRESTACION DE SERVICIO PROFESIONAL']


def ciclo_de(texto):
    """Periodo del plan escrito en la factura -> (desde, hasta) o None. El ciclo es de 365 días."""
    t = re.sub(r'\s+', ' ', texto)
    m = re.search(rf'(\d{{1,2}}) (?:DE )?{MES_RE} (?:DE |DEL )?(\d{{4}}) AL (?:\d{{1,2}} )?(\d{{1,2}}) (?:DE )?{MES_RE} (?:DE |DEL )?(\d{{4}})', t)
    if m:
        desde = dt.date(int(m.group(3)), MESES[m.group(2)], int(m.group(1)))
        fin = dt.date(int(m.group(6)), MESES[m.group(5)], int(m.group(4)))
    else:
        m = re.search(rf'(?:ENTRE )?{MES_RE} (?:DE |DEL )?(\d{{4}}) (?:Y|A|AL) {MES_RE} (?:DE |DEL )?(\d{{4}})', t)
        if not m:
            return None
        desde = dt.date(int(m.group(2)), MESES[m.group(1)], 1)
        fin = dt.date(int(m.group(4)), MESES[m.group(3)], 1)
    un_anio = dt.date(desde.year + 1, desde.month, desde.day) if not (desde.month == 2 and desde.day == 29) else dt.date(desde.year + 1, 3, 1)
    # "del 1 agosto 2026 al 1 agosto 2027" -> termina el día anterior; "1 dic 2025 al 30 nov 2026" se respeta.
    hasta = un_anio - dt.timedelta(days=1) if fin >= un_anio else fin
    return desde, hasta


ws = openpyxl.load_workbook(BASE + 'renovacion_express.xlsx', data_only=True).worksheets[0]
ultimas = {}            # (nit, clave servicio) -> factura de plan más reciente
no_incluidas = []       # facturas en la ventana que no son plan o no se pueden cargar, con motivo
facturas_ventana = 0
for n_fila, f in enumerate(ws.iter_rows(min_row=3, values_only=True), 3):
    try:
        fecha = dt.date(int(f[2]), int(f[3]), int(f[4]))
    except (TypeError, ValueError):
        continue
    if fecha < DESDE_EXPRESS:
        continue
    facturas_ventana += 1
    desc = re.sub(r'\s+', ' ', sin_tildes(f[17]))
    desc2 = re.sub(r'\s+', ' ', sin_tildes(f[18]))
    nit = normalizar_nit(digitos(f[8]))[0]
    base = {'fila': n_fila, 'fv': f[1], 'fecha': fecha, 'nit': nit, 'nombre': str(f[9] or '').strip(), 'descripcion': str(f[17] or '').strip()[:200],
            'valor': f[22]}
    if not nit:
        no_incluidas.append({**base, 'motivo': 'línea sin NIT (continuación de otra factura)'})
        continue
    if any(p in desc for p in NO_PLAN) or 'CONSUMO ADICIONAL' in desc:
        no_incluidas.append({**base, 'motivo': 'no es un plan: adicionales o servicio puntual'})
        continue
    if 'ASOCIADO' in desc:
        no_incluidas.append({**base, 'motivo': 'plan TuCarpeta por asociado: definir cómo se registra cada asociado'})
        continue
    servicios = [(s, c) for patron, s, c in SERV_EXP if re.search(patron, desc)]
    nota = []
    if not servicios and re.search(r'FACTURA(CION)? ELECTRONICA', desc):
        servicios = [('iFactura-Emision', 'EMISION')]
        nota.append('servicio inferido: «factura electrónica» sin decir emisión o recepción, se tomó EMISIÓN (confirmar)')
    tope = re.search(r'(?:HASTA|CANTIDAD|BOLSA|PLAN BASICO)\D{0,3}(\d[\d.,]*)\s*(?:DOC|RIPS)', desc)
    clave = '+'.join(c for _, c in servicios) or 'PLAN'
    previa = ultimas.get((nit, clave))
    if previa and previa['fecha'] > fecha:
        continue
    ultimas[(nit, clave)] = {**base, 'servicios': servicios, 'clave': clave, 'nota': nota,
                             'tope': int(re.sub(r'\D', '', tope.group(1))) if tope else None,
                             'ciclo': ciclo_de(desc2) or ciclo_de(desc), 'rips': 'RIPS' in desc, 'cantidad': f[20]}

express = []
for (nit, clave), x in sorted(ultimas.items()):
    falta, obs = {'rtefte', 'rteiva', 'rteica'}, list(x['nota'])
    servicios = [s for s, _ in x['servicios']]
    if not servicios:
        falta.add('servicios')
        servicios = [f'{COMPLETAR}: servicio']
        obs.append('la factura no dice el servicio (ej. plan MAITE / plan básico): indicar cuál')
    if x['rips']:
        falta.add('servicios')
        servicios.append(f'{COMPLETAR}: RIPS')
        obs.append('incluye RIPS, que no tiene equivalente en Data')
    if len(x['servicios']) > 1:
        obs.append('un solo plan para varios servicios: el tope es compartido (CONJUNTO)')
    if x['tope'] is None:
        falta.add('hasta')
        obs.append('la factura no dice el tope de documentos')
    valor = num(x['valor'])
    if not valor or float(valor) <= 0:
        falta.add('valor')
    if x['cantidad'] not in (None, 1, 1.0):
        falta.add('valor')
        obs.append(f'la factura tiene cantidad {x["cantidad"]}: se tomó el subtotal como valor anual (confirmar)')
    if x['ciclo']:
        desde, hasta = (d.isoformat() for d in x['ciclo'])
    else:
        desde, hasta = FECHA_BASE, ''
        obs.append('la factura no indica el periodo: queda con la fecha base hasta la próxima renovación')
    obs.insert(0, f'Última factura FV-{int(x["fv"]) if x["fv"] else "?"} del {x["fecha"].strftime("%d/%m/%Y")}: {x["descripcion"][:110]}')
    express.append({
        'nit': nit, 'razon_social': x['nombre'], 'segmento': 'EXPRESS', 'contrato_id': f'{nit}-EXP-{clave.replace("+", "-")}',
        'vigencia_desde': desde, 'vigencia_hasta': hasta, 'moneda': 'COP', 'anio': desde[:4],
        'servicios': '+'.join(servicios), 'volumen': '', 'modelo': 'PLAN_ANUAL',
        'desde': '1' if x['tope'] else '', 'hasta': str(x['tope'] or ''), 'valor': valor, 'periodicidad': 'ANUAL',
        'rtefte': '', 'rteiva': '', 'rteica': '', 'observaciones': '; '.join(obs), '_falta': falta, '_auto': set(),
        '_origen': 'renovacion_express.xlsx',
    })

# Mismo NIT + servicio en dos contratos (ej. un Express y un corporativo): el empalme no sabría cuál cobrar
uso_serv = defaultdict(set)
for r in piloto + corp + express:
    for sv_ in r['servicios'].split('+'):
        if sv_ and not sv_.startswith(COMPLETAR):
            uso_serv[(r['nit'], sv_)].add(r['contrato_id'])
for r in piloto + corp + express:
    dobles = sorted({sv_ for sv_ in r['servicios'].split('+') if len(uso_serv.get((r['nit'], sv_), ())) > 1})
    if dobles:
        r['_falta'].add('servicios')
        otros = sorted(set().union(*(uso_serv[(r['nit'], d)] for d in dobles)) - {r['contrato_id']})
        r['observaciones'] = '; '.join([o for o in [r['observaciones']] if o] +
                                       [f'{", ".join(dobles)} también está en {", ".join(otros)}: dejarlo en un solo contrato'])

corp.sort(key=lambda r: (r['razon_social'], r['contrato_id'], r['servicios'], r['modelo'] != 'MINIMO',
                         float(r['desde'] or 0)))
express.sort(key=lambda r: (r['razon_social'], r['contrato_id']))
filas = piloto + corp + express
for r in filas:
    if r['_falta'] - {'rtefte', 'rteiva', 'rteica'} and COMPLETAR not in r['observaciones']:
        r['observaciones'] = f'{COMPLETAR}: ' + r['observaciones'] if r['observaciones'] else COMPLETAR

# ------------------------------------------------------------------ "Sin contrato": NIT con consumo en julio y sin fila
nits_maestro = {r['nit'] for r in filas}
sin = (bq[~bq['NIT'].isin(nits_maestro) & (bq['CLASIFICACION'] != 'Cliente retirado')]
       .groupby('NIT').agg(cliente=('CLIENTE', 'first'), clasificacion=('CLASIFICACION', 'first'),
                           servicios=('Servicio', lambda s: ', '.join(sorted(set(s)))), transacciones=('Cantidad', 'sum'))
       .reset_index().sort_values('transacciones', ascending=False))

# ------------------------------------------------------------------ servicios usados sin tarifa (NIT en el maestro)
cubiertos = defaultdict(set)
for r in filas:
    cubiertos[r['nit']].update(s for s in r['servicios'].split('+') if s and not s.startswith(COMPLETAR))
nombre_maestro = {r['nit']: r['razon_social'] for r in filas}
uso = bq[bq['NIT'].isin(nits_maestro)].groupby(['NIT', 'Servicio'])['Cantidad'].sum().reset_index()
sin_tarifa = [(n, nombre_maestro[n], s, int(q)) for n, s, q in uso.itertuples(index=False) if s not in cubiertos[n] and q > 0]
sin_tarifa.sort(key=lambda x: -x[3])

# ------------------------------------------------------------------ Express en Data sin plan activo
ultima_fact = {}
for f in openpyxl.load_workbook(BASE + 'renovacion_express.xlsx', data_only=True, read_only=True).worksheets[0].iter_rows(min_row=3, values_only=True):
    try:
        d_ = dt.date(int(f[2]), int(f[3]), int(f[4]))
    except (TypeError, ValueError):
        continue
    n_ = digitos(f[8])
    if n_:
        ultima_fact[n_] = max(ultima_fact.get(n_, d_), d_)
exp_data = (bq[bq['CLASIFICACION'] == 'Express'].groupby('NIT')
            .agg(cliente=('CLIENTE', 'first'), servicios=('Servicio', lambda x: ', '.join(sorted(set(x)))), transacciones=('Cantidad', 'sum'))
            .reset_index())
exp_sin_plan = exp_data[~exp_data['NIT'].isin({r['nit'] for r in piloto + corp + express})].copy()
exp_sin_plan['situacion'] = exp_sin_plan['NIT'].map(
    lambda n_: f'plan vencido: última factura {ultima_fact[n_]:%d/%m/%Y}' if n_ in ultima_fact else 'nunca aparece en renovacion_express.xlsx')
exp_sin_plan = exp_sin_plan.sort_values('transacciones', ascending=False)

# ------------------------------------------------------------------ CSV (lo que lee el sistema)
with open(BASE + 'Maestro_Contratos_Contabilidad.csv', 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=COLS, delimiter=';')
    w.writeheader()
    w.writerows({c: r.get(c, '') for c in COLS} for r in filas)

# ------------------------------------------------------------------ XLSX (para llenar)
ARIAL = 'Arial'
f_base = Font(name=ARIAL, size=10)
f_bold = Font(name=ARIAL, size=10, bold=True)
f_head = Font(name=ARIAL, size=10, bold=True, color='FFFFFF')
f_tit = Font(name=ARIAL, size=14, bold=True)
f_muted = Font(name=ARIAL, size=9, italic=True, color='595959')
fill_head = PatternFill('solid', fgColor='565656')
fill_amarillo = PatternFill('solid', fgColor='FFF2CC')
fill_express = PatternFill('solid', fgColor='EAF3FB')
fill_piloto = PatternFill('solid', fgColor='EEF5EA')
fill_naranja = PatternFill('solid', fgColor='FCE4D6')
borde = Border(bottom=Side(style='thin', color='D9D9D9'))
wrap = Alignment(wrap_text=True, vertical='top')


def encabezado(hoja, titulos, anchos):
    for j, (h, w_) in enumerate(zip(titulos, anchos), 1):
        c = hoja.cell(1, j, h)
        c.font, c.fill, c.alignment = f_head, fill_head, Alignment(vertical='center')
        hoja.column_dimensions[get_column_letter(j)].width = w_
    hoja.freeze_panes = 'A2'


wb = openpyxl.Workbook()

# --- Instrucciones
ins = wb.active
ins.title = 'Instrucciones'
ins.sheet_view.showGridLines = False
for col, w_ in zip('ABCD', [18, 14, 62, 40]):
    ins.column_dimensions[col].width = w_
r = 1
ins.cell(r, 1, 'Maestro de contratos — Facturación COE').font = f_tit
r += 1
ins.cell(r, 1, 'Prellenado con los archivos de contratos que entregó Contabilidad. Solo falta completar lo que está en amarillo.').font = f_muted
r += 2
resumen = [
    (f'{len({x["contrato_id"] for x in piloto})} contratos del piloto', 'ya validados al peso con las facturas de julio (fondo verde)'),
    (f'{len({x["contrato_id"] for x in corp})} contratos corporativos', 'tomados de Contratos_FACTURA/RECAUDO/SALUD/SEGUROS_estructurado.xlsx'),
    (f'{len(express)} suscripciones Express', 'clientes activos de renovacion_express.xlsx: plan facturado desde el 1-sep-2025 (fondo azul)'),
    (f'{sum(1 for x in filas if x["_falta"])} filas con algo por completar', 'celdas en amarillo; la columna observaciones dice qué falta'),
    (f'{len(sin)} NIT con consumo en julio sin contrato', 'hoja «Sin contrato (BigQuery julio)»: agregar su contrato si se les cobra'),
    (f'{len(exp_sin_plan)} NIT «Express» en Data sin plan activo', 'hoja «Express sin plan (Data julio)»: usan el servicio y no tienen renovación desde el 1-sep-2025'),
    (f'{len(sin_tarifa)} servicios usados sin tarifa', 'hoja «Servicio sin tarifa (julio)»: clientes del maestro que usaron un servicio que su contrato no cubre'),
]
ins.cell(r, 1, 'Qué trae').font = f_bold
r += 1
for a, b in resumen:
    ins.cell(r, 1, '•').font = f_base
    c = ins.cell(r, 2, f'{a}: {b}')
    c.font = f_base
    ins.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
    r += 1
r += 1
pasos = [
    'Complete las celdas en AMARILLO de la hoja «Contratos». La columna «observaciones» explica qué falta en cada fila. Al completar, borre la palabra COMPLETAR de la observación.',
    'Las celdas en NARANJA se completaron automáticamente a partir de la evidencia (ej. un escalón mal digitado): verifíquelas.',
    'Express: esta carga solo registra el plan vigente de cada suscripción (no genera cobro). Renovaciones, adicionales y clientes nuevos los registra Comercial en la plataforma con su PDF, y Contabilidad los aprueba.',
    'Los nombres de servicio deben ser EXACTOS a la hoja «Servicios» (son los que reporta Data). Si un contrato agrupa varios, únalos con + sin espacios.',
    'Escriba los valores como números simples, sin $ ni puntos de miles: 1508529 o 236,45. Las columnas numéricas ya tienen formato: no lo cambie (Excel recorta decimales en formato General).',
    'Fechas en formato AAAA-MM-DD. Si no conoce la fecha del contrato, deje la fecha base 2026-01-01.',
    'Al terminar: Archivo › Guardar como › «CSV UTF-8 (delimitado por comas)» y envíe ese archivo. No cambie los encabezados.',
]
ins.cell(r, 1, 'Cómo llenarlo').font = f_bold
r += 1
for i, p in enumerate(pasos, 1):
    ins.cell(r, 1, f'{i}.').font = f_base
    ins.cell(r, 1).alignment = Alignment(vertical='top')
    c = ins.cell(r, 2, p)
    c.font, c.alignment = f_base, wrap
    ins.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
    ins.row_dimensions[r].height = 14 * max(1, -(-len(p) // 105)) + 4
    r += 1
r += 1
ins.cell(r, 1, 'Columnas').font = f_bold
r += 1
for j, h in enumerate(['Columna', 'Obligatoria', 'Qué poner', 'Ejemplo'], 1):
    c = ins.cell(r, j, h)
    c.font, c.fill = f_head, fill_head
r += 1
COLUMNAS = [
    ('nit', 'Sí', 'NIT del cliente, solo números, sin dígito de verificación.', '815000997'),
    ('razon_social', 'Sí', 'Nombre del cliente.', 'ALMOTORES'),
    ('segmento', 'Sí', 'CORPORATIVO o EXPRESS. Es del contrato: un mismo NIT puede tener de los dos (ALKA MOTOR: Emisión corporativo; Recepción, Documento Soporte y Nómina Express).', 'CORPORATIVO'),
    ('contrato_id', 'Sí', 'Código único del contrato. Corporativo: NIT-VERTICAL-AÑO. Express: uno por suscripción, NIT-EXP-SERVICIO. Todas las filas de un mismo contrato llevan el mismo código.', '900894782-EXP-RECEPCION'),
    ('vigencia_desde', 'Sí', f'Fecha de inicio del contrato. Si no se conoce, deje la fecha base {FECHA_BASE}: la vigencia real empieza a contar cuando se registre la renovación.', FECHA_BASE),
    ('vigencia_hasta', 'No', 'Fin del contrato, si se conoce. Vacío = sin vencimiento hasta la próxima renovación.', ''),
    ('moneda', 'Sí', 'COP. (USD aún no se procesa: esas filas quedan marcadas.)', 'COP'),
    ('anio', 'Sí', 'Año de los precios. Express: año en que inicia el ciclo.', '2026'),
    ('servicios', 'Sí', 'Servicio(s) exactos de la hoja «Servicios», unidos con +.', 'iFactura-Emision+iFactura-Recepcion'),
    ('volumen', 'Solo corporativo', 'CONJUNTO (regla general): si una tabla agrupa servicios (ej. Emisión y Recepción), sus transacciones se suman. Si cada servicio tiene su propia tabla, va en filas aparte. SEPARADO solo si una misma tabla se aplica a cada servicio por separado. En EXPRESS se deja vacío: cada servicio es una suscripción aparte con su tarifa y su tope.', 'CONJUNTO'),
    ('modelo', 'Sí', 'Ver hoja «Modelos».', 'ESCALA'),
    ('desde', 'Según modelo', 'Transacción desde la que aplica la fila.', '1001'),
    ('hasta', 'Según modelo', 'Transacción hasta la que aplica. Vacío = en adelante. En MINIMO y PLAN_ANUAL es el tope de transacciones incluidas.', '2500'),
    ('valor', 'Sí', 'Precio unitario (ESCALA) o monto (MINIMO, BOLSA, FIJO, RECARGO, PLAN_ANUAL), antes de IVA. Hasta 4 decimales.', '236,45'),
    ('periodicidad', 'Sí', 'MENSUAL (corporativos) o ANUAL (Express).', 'MENSUAL'),
    ('rtefte', 'Sí, aquí o en la app', 'Retención en la fuente que practica el cliente, en %. 0 si no aplica. Vacío = la que tenga el cliente en la app (Clientes → Editar retenciones); si no tiene, el contrato no se carga.', '3,5%'),
    ('rteiva', 'Sí, aquí o en la app', 'Retención de IVA que practica el cliente, en %. 0 si no aplica. Vacío = la que tenga el cliente en la app (Clientes → Editar retenciones); si no tiene, el contrato no se carga.', '15%'),
    ('rteica', 'Sí, aquí o en la app', 'Retención de ICA que practica el cliente, en %. 0 si no aplica. Vacío = la que tenga el cliente en la app (Clientes → Editar retenciones); si no tiene, el contrato no se carga.', '0,966%'),
    ('observaciones', 'No', 'Qué falta en la fila (generado) o notas para revisión.', ''),
]
for fila in COLUMNAS:
    for j, v in enumerate(fila, 1):
        c = ins.cell(r, j, v)
        c.font, c.alignment, c.border = (f_bold if j == 1 else f_base), wrap, borde
    ins.row_dimensions[r].height = 14 * max(1, -(-len(fila[2]) // 62)) + 4
    r += 1
for hoja_ in (ins,):
    hoja_.page_setup.orientation = 'landscape'
    hoja_.page_setup.fitToWidth, hoja_.page_setup.fitToHeight = 1, 0
    hoja_.sheet_properties.pageSetUpPr.fitToPage = True

# --- Contratos
ct = wb.create_sheet('Contratos')
encabezado(ct, COLS, [12, 40, 15, 30, 13, 13, 8, 7, 44, 11, 12, 10, 12, 16, 12, 9, 9, 9, 90])
ct.freeze_panes = 'C2'
TEXTO = {'nit', 'contrato_id', 'vigencia_desde', 'vigencia_hasta', 'anio', 'servicios'}
FORMATO = {'desde': '0', 'hasta': '0', 'valor': '0.00##', 'rtefte': '0.00##%', 'rteiva': '0.00##%', 'rteica': '0.00##%'}
MAX = 3000
for i, fila in enumerate(filas, 2):
    for j, col in enumerate(COLS, 1):
        v = fila.get(col, '')
        if col in FORMATO and v not in ('', None):
            v = float(v)
            v = int(v) if v == int(v) and col in ('desde', 'hasta') else v
        c = ct.cell(i, j, v if v != '' else None)
        c.font = f_base
        if fila['segmento'] == 'EXPRESS':
            c.fill = fill_express
        elif fila['nit'] in PILOTO:
            c.fill = fill_piloto
        if col in fila.get('_auto', set()):
            c.fill = fill_naranja
        if col in fila['_falta'] or (col == 'observaciones' and COMPLETAR in str(v)):
            c.fill = fill_amarillo
for col in COLS:
    j = COLS.index(col) + 1
    fmt = '@' if col in TEXTO else FORMATO.get(col)
    if fmt:
        for i in range(2, MAX + 1):
            ct.cell(i, j).number_format = fmt
listas = {'segmento': '"CORPORATIVO,EXPRESS"', 'moneda': '"COP,USD"', 'volumen': '"CONJUNTO,SEPARADO"',
          'modelo': '"ESCALA,MINIMO,BOLSA,FIJO,RECARGO,PLAN_ANUAL"', 'periodicidad': '"MENSUAL,ANUAL"'}
for col, formula in listas.items():
    letra = get_column_letter(COLS.index(col) + 1)
    dv = DataValidation(type='list', formula1=formula, allow_blank=True, showErrorMessage=True,
                        errorTitle='Valor no válido', error=f'Use un valor de la lista para «{col}».')
    dv.add(f'{letra}2:{letra}{MAX}')
    ct.add_data_validation(dv)
ct.cell(1, COLS.index('servicios') + 1).comment = Comment('Copie el nombre exacto de la hoja «Servicios». Varios: únalos con + (sin espacios).', 'Facturación COE')
ct.cell(1, COLS.index('hasta') + 1).comment = Comment('Vacío = en adelante. En MINIMO y PLAN_ANUAL: tope de transacciones incluidas.', 'Facturación COE')
ct.auto_filter.ref = f'A1:{get_column_letter(len(COLS))}{len(filas) + 1}'

# --- Pendientes por cliente
pc = wb.create_sheet('Pendientes por cliente')
encabezado(pc, ['Cliente', 'NIT', 'Contrato', 'Filas', 'Qué falta', 'Origen'], [40, 12, 30, 7, 90, 38])
grupos = defaultdict(list)
for x in filas:
    if x['_falta']:
        grupos[(x['razon_social'], x['nit'], x['contrato_id'], x['_origen'])].append(x)
NOMBRES = {'rtefte': 'retenciones', 'rteiva': 'retenciones', 'rteica': 'retenciones', 'servicios': 'servicio',
           'volumen': 'CONJUNTO o SEPARADO', 'valor': 'valor', 'nit': 'NIT', 'moneda': 'moneda USD',
           'hasta': 'tope del mínimo / escalones', 'desde': 'escalones', 'anio': 'año', 'modelo': 'modelo', 'segmento': 'segmento'}
for i, ((cli, nit, cid, origen), xs) in enumerate(sorted(grupos.items()), 2):
    que = sorted({NOMBRES.get(c, c) for x in xs for c in x['_falta']})
    detalles = sorted({o.strip() for x in xs for o in x['observaciones'].replace(f'{COMPLETAR}:', '').split(';')
                       if o.strip() and not o.strip().startswith('Factura FV') and 'Vigencia real' not in o})
    for j, v in enumerate([cli, nit, cid, len(xs), ', '.join(que) + ('. ' + ' · '.join(detalles) if detalles else ''), origen], 1):
        c = pc.cell(i, j, v)
        c.font, c.alignment, c.border = f_base, wrap, borde

# --- Sin contrato (BigQuery julio)
sc = wb.create_sheet('Sin contrato (BigQuery julio)')
encabezado(sc, ['NIT', 'Cliente (Data)', 'Clasificación (Data)', 'Servicios que usó', 'Transacciones julio'], [12, 46, 16, 60, 18])
for i, x in enumerate(sin.itertuples(), 2):
    for j, v in enumerate([x.NIT, x.cliente, x.clasificacion, x.servicios, int(x.transacciones)], 1):
        c = sc.cell(i, j, v)
        c.font = f_base
    sc.cell(i, 5).number_format = '#,##0'
n = len(sin) + 3
sc.cell(n, 1, 'NIT que en julio tuvieron transacciones y no aparecen en ningún contrato del maestro. Si se les cobra, agregue su contrato en «Contratos».').font = f_muted

# --- Express en Data sin plan activo
ed = wb.create_sheet('Express sin plan (Data julio)')
encabezado(ed, ['NIT', 'Cliente (Data)', 'Servicios que usó', 'Transacciones julio', 'Situación'], [13, 46, 50, 18, 42])
for i, x in enumerate(exp_sin_plan.itertuples(), 2):
    for j, v in enumerate([x.NIT, x.cliente, x.servicios, int(x.transacciones), x.situacion], 1):
        ed.cell(i, j, v).font = f_base
    ed.cell(i, 4).number_format = '#,##0'
ed.cell(len(exp_sin_plan) + 3, 1, 'NIT que Data clasifica como Express y que usaron el servicio en julio, pero no tienen plan facturado desde el 1-sep-2025. '
        'Revisar con Comercial: plan vencido sin renovar o cliente facturado por otra vía.').font = f_muted

# --- Express no incluidos (facturas desde el 1-sep-2025 que no son plan)
en = wb.create_sheet('Express no incluidos')
encabezado(en, ['Fila', 'FV', 'Fecha', 'NIT', 'Cliente', 'Descripción', 'Valor', 'Motivo'], [7, 9, 11, 12, 34, 70, 13, 45])
for i, x in enumerate(sorted(no_incluidas, key=lambda z: (z['motivo'], z['fecha'])), 2):
    for j, v in enumerate([x['fila'], x['fv'], x['fecha'].strftime('%d/%m/%Y'), x['nit'], x['nombre'], x['descripcion'], x['valor'], x['motivo']], 1):
        c = en.cell(i, j, v)
        c.font = f_base
    en.cell(i, 7).number_format = '#,##0'
en.cell(len(no_incluidas) + 3, 1, 'Facturas de renovacion_express.xlsx desde el 1-sep-2025 que no se cargaron como suscripción. Revise si alguna debe ser un plan.').font = f_muted

# --- Servicio sin tarifa (BigQuery julio)
st = wb.create_sheet('Servicio sin tarifa (julio)')
encabezado(st, ['NIT', 'Cliente', 'Servicio que usó', 'Transacciones julio'], [12, 46, 34, 18])
for i, x in enumerate(sin_tarifa, 2):
    for j, v in enumerate(x, 1):
        sc_ = st.cell(i, j, v)
        sc_.font = f_base
    st.cell(i, 4).number_format = '#,##0'
st.cell(len(sin_tarifa) + 3, 1, 'Clientes que están en el maestro pero usaron en julio un servicio que su contrato no incluye (o cuyo servicio quedó por completar). Defina la tarifa o la regla de cobro.').font = f_muted

# --- Excluidos
ex = wb.create_sheet('Excluidos')
encabezado(ex, ['Archivo', 'Cliente', 'NIT', 'Motivo'], [12, 40, 12, 50])
vistos = set()
i = 2
for x in excluidos:
    k = (x['archivo'], x['cliente'])
    if k in vistos:
        continue
    vistos.add(k)
    for j, v in enumerate([x['archivo'], x['cliente'], x['nit'], x['motivo']], 1):
        ex.cell(i, j, v).font = f_base
    i += 1

# --- Servicios
sv = wb.create_sheet('Servicios')
sv.sheet_view.showGridLines = False
CATALOGO = [
    ('iFactura-Emision', 'iFactura', 'Emisión de factura electrónica'), ('iFactura-Recepcion', 'iFactura', 'Recepción de factura electrónica'),
    ('iFactura-DocSoporte', 'iFactura', 'Documento soporte'), ('iFactura-Nomina', 'iFactura', 'Nómina electrónica'),
    ('ISALUD - Admin Cuentas Medicas', 'iSalud', 'Administración de cuentas médicas'), ('iSoat - Emision', 'iSoat', 'Emisión SOAT'),
    ('iSoat - Mail', 'iSoat', 'Envío por correo'), ('iSoat - SMS', 'iSoat', 'Envío por SMS'), ('iSoat - OTP', 'iSoat', 'OTP'),
    ('iSeguros - Cotizadores', 'iSeguros', 'Cotizadores'), ('iSeguros - Emisión', 'iSeguros', 'Emisión de pólizas'),
    ('IRECAUDO', 'iRecaudo', 'iRecaudo'), ('IRECAUDO_Express', 'iRecaudo', 'iRecaudo Express'), ('IRecaudo-Silver', 'iRecaudo', 'iRecaudo Silver'),
    ('iDocumentos', 'iDocumentos', 'iDocumentos'),
]
encabezado(sv, ['Servicio (copiar exacto)', 'Producto', 'Descripción'], [34, 14, 40])
for i, fila in enumerate(CATALOGO, 2):
    for j, v in enumerate(fila, 1):
        c = sv.cell(i, j, v)
        c.font, c.border = (f_bold if j == 1 else f_base), borde
n = len(CATALOGO) + 3
sv.cell(n, 1, 'Son los nombres que reporta Data en BigQuery. Servicios como Circular 001, Estampado cronológico, Link de pago o RIPS no tienen todavía equivalente: hay que acordarlo con Data antes de poder cobrarlos automáticamente.').font = f_muted

# --- Modelos
md = wb.create_sheet('Modelos')
md.sheet_view.showGridLines = False
encabezado(md, ['Modelo', 'Cómo cobra', 'desde / hasta', 'valor', 'Ejemplo real'], [14, 52, 26, 24, 46])
MODELOS_TXT = [
    ('ESCALA', 'El volumen total del mes cae en un escalón y TODO el volumen se cobra a ese precio.', 'rango del escalón', 'precio por transacción', 'SAN CARLOS: 3.646 × $831'),
    ('MINIMO', 'Monto plano que cubre las primeras transacciones; el excedente se cobra al precio del escalón del volumen total. Va con filas ESCALA.', 'desde 1, hasta = tope cubierto', 'monto del mínimo', 'SANTA FE: $7.128.368 cubre 6.000; 56.393 adicionales × $1.029'),
    ('BOLSA', 'Monto plano según la banda en que cae el volumen total (no se multiplica).', 'rango de la banda', 'monto de la banda', 'SALUD MIA: 3.813 cae en 3.501-4.000 → $874.739'),
    ('FIJO', 'Monto fijo mensual sin importar el volumen.', 'vacíos', 'monto mensual', ''),
    ('RECARGO', 'Cargo fijo mensual que se suma a cualquier otro modelo (ej. mantenimiento).', 'vacíos', 'monto mensual', 'SAN CARLOS: + $1.839.270 de mantenimiento'),
    ('PLAN_ANUAL', 'Express: plan vigente de la suscripción (valor anual y tope de documentos). En esta carga solo se registra; el cobro lo genera cada renovación aprobada.', 'desde 1, hasta = tope de documentos', 'valor anual', 'GOMOSEC Recepción: $1.508.529 hasta 2.000 documentos'),
]
for i, fila in enumerate(MODELOS_TXT, 2):
    for j, v in enumerate(fila, 1):
        c = md.cell(i, j, v)
        c.font, c.alignment, c.border = (f_bold if j == 1 else f_base), wrap, borde
    md.row_dimensions[i].height = 42

wb.active = 1
wb.save(BASE + 'Maestro_Contratos_Contabilidad.xlsx')

print(f'piloto: {len(piloto)} filas · corporativos: {len(corp)} filas en {len({x["contrato_id"] for x in corp})} contratos · express: {len(express)}')
print(f'filas con algo por completar: {sum(1 for x in filas if x["_falta"])} · solo retenciones: {sum(1 for x in filas if x["_falta"] and x["_falta"] <= {"rtefte", "rteiva", "rteica"})}')
print('faltantes por tipo:', dict(Counter(NOMBRES.get(c, c) for x in filas for c in x['_falta'] - {'rtefte', 'rteiva', 'rteica'})))
print(f'excluidos (retirados): {len(vistos)} · NIT sin contrato con consumo en julio: {len(sin)} · servicios usados sin tarifa: {len(sin_tarifa)}')
print(f'Express: {facturas_ventana} facturas desde {DESDE_EXPRESS} -> {len(express)} suscripciones activas, {len(no_incluidas)} facturas no incluidas')
