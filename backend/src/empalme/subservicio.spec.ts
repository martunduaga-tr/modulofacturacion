import { liquidarPeriodo, TasasBase } from './empalme';
import { leerTarifarioCsv } from './tarifario-csv';
import { leerVolumenesCsv } from './volumenes-bigquery';

const TASAS_BASE: TasasBase = { iva: 0.19, rtefte: 0.035, rteica: 0.00966, rteiva: 0.15, autorretencion: 0.008 };

const ENCABEZADO = 'nit;razon_social;segmento;contrato_id;vigencia_desde;anio;servicios;volumen;modelo;desde;hasta;valor;periodicidad;rtefte;rteiva;rteica';
const tarifario = (filas: string[]) => leerTarifarioCsv([ENCABEZADO, ...filas].join('\n')).contratos;
const fila = (servicio: string, valor: number) => `860002400;PREVISORA;CORPORATIVO;C1;2026-01-01;2026;${servicio};CONJUNTO;ESCALA;1;;${valor};MENSUAL;0;0;0`;

const CSV = [
  'Fecha,NIT,Servicio,SubServicio,Cantidad',
  '2026-09-01,860002400,iDocumentos,ANI,100',
  '2026-09-02,860002400,iDocumentos,ANI,20',
  '2026-09-01,860002400,iDocumentos,FirmaElectrónica,50',
  '2026-09-01,860002400,iDocumentos,,5',
  '2026-09-01,860009578,iSoat - Emision,,1000',
  '2026-09-01,860009578,iSoat - Emision,Hrs_Dev,300',
].join('\n');
const volumenes = leerVolumenesCsv(CSV, '2026-09');

describe('Subservicio en el empalme', () => {
  it('agrupa por Servicio/SubServicio; Hrs_Dev entra por defecto', () => {
    expect(Object.fromEntries(volumenes.porNit.get('860002400')!)).toEqual({ 'iDocumentos/ANI': 120, 'iDocumentos/FirmaElectrónica': 50, iDocumentos: 5 });
    expect(Object.fromEntries(volumenes.porNit.get('860009578')!)).toEqual({ 'iSoat - Emision': 1000, 'iSoat - Emision/Hrs_Dev': 300 });
    expect(volumenes.hrsDev).toEqual({ cantidad: 300, excluido: false });
    // La gráfica y las alertas siguen por servicio.
    expect(volumenes.diario.filter((d) => d.nit === '860002400' && d.fecha === '2026-09-01')).toEqual([
      { fecha: '2026-09-01', nit: '860002400', servicio: 'iDocumentos', cantidad: 155 },
    ]);
  });

  it('Hrs_Dev: se suma al item de iSoat - Emision, salvo que Contabilidad lo excluya en la liquidación', () => {
    const contrato = leerTarifarioCsv([ENCABEZADO, '860009578;SDE;CORPORATIVO;C2;2026-01-01;2026;iSoat - Emision;CONJUNTO;ESCALA;1;;10;MENSUAL;0;0;0'].join('\n')).contratos;
    const volumen = (excluirHrsDev: boolean) => {
      const v = leerVolumenesCsv(CSV, '2026-09', { excluirHrsDev });
      return { v, vol: liquidarPeriodo(contrato, v, TASAS_BASE).liquidaciones[0].resultado.volumen };
    };
    expect(volumen(false).vol).toBe(1300);
    const excl = volumen(true);
    expect(excl.vol).toBe(1000);
    expect(excl.v.hrsDev).toEqual({ cantidad: 300, excluido: true });
    expect(excl.v.diario.find((d) => d.nit === '860009578')!.cantidad).toBe(1000);
  });

  it('contrato por servicio completo: suma todos los subservicios (como antes)', () => {
    const r = liquidarPeriodo(tarifario([fila('iDocumentos', 100)]), volumenes, TASAS_BASE);
    expect(r.liquidaciones).toHaveLength(1);
    expect(r.liquidaciones[0].resultado.volumen).toBe(175);
    expect(r.noEmpalmados.filter((n) => n.nit === '860002400')).toEqual([]);
  });

  it('subservicio con tarifa propia: lo toma su item y el resto va al servicio completo', () => {
    const r = liquidarPeriodo(tarifario([fila('iDocumentos/ANI', 300), fila('iDocumentos', 100)]), volumenes, TASAS_BASE);
    const vol = Object.fromEntries(r.liquidaciones.map((l) => [l.servicios.join('+'), l.resultado.volumen]));
    expect(vol).toEqual({ 'iDocumentos/ANI': 120, iDocumentos: 55 });
  });

  it('solo subservicios en el contrato: lo que no tiene tarifa queda pendiente con su subservicio', () => {
    const r = liquidarPeriodo(tarifario([fila('iDocumentos/ANI', 300)]), volumenes, TASAS_BASE);
    expect(r.liquidaciones.map((l) => l.resultado.volumen)).toEqual([120]);
    expect(r.noEmpalmados.filter((n) => n.nit === '860002400').map((n) => [n.servicio, n.cantidad, n.motivo])).toEqual([
      ['iDocumentos/FirmaElectrónica', 50, 'SERVICIO_SIN_TARIFA'],
      ['iDocumentos', 5, 'SERVICIO_SIN_TARIFA'],
    ]);
  });

  it('cliente sin RteIVA: el contrato no se liquida con las tasas globales, queda como error SIN_RETENCIONES', () => {
    const c = tarifario([`860002400;PREVISORA;CORPORATIVO;C1;2026-01-01;2026;iDocumentos;CONJUNTO;ESCALA;1;;100;MENSUAL;0.035;;0`]);
    const r = liquidarPeriodo(c, volumenes, TASAS_BASE);
    expect(r.liquidaciones).toEqual([]);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].volumen).toBe(175);
    expect(r.errores[0].motivo).toMatch(/^SIN_RETENCIONES: falta RteIVA /);
  });
});
