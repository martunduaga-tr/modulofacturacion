import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Database, FileUp, TriangleAlert } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useUltimoPeriodo } from '../hooks/useUltimoPeriodo';
import type { ResultadoHistorico, EmpalmePendiente, EstadoBigQuery, ResultadoImportacion, ResumenLiquidacion } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { etiquetaMotivo, formatearMoneda, formatearNumero, MOTIVO_PENDIENTE } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { Spinner, ErrorState, EmptyState } from '../components/ui/Feedback';
import { useToast } from '../components/ui/ToastProvider';
import styles from './EmpalmePage.module.css';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formulario(archivo: File, extra: Record<string, string> = {}): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  f.append('archivo', archivo);
  return f;
}

function mensajeError(e: unknown, defecto: string) {
  return e instanceof ApiError ? e.message : defecto;
}

export function EmpalmePage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const puedeEditar = user?.rol === 'administrador' || user?.rol === 'editor';

  const { anio, mes, setAnio, setMes } = useUltimoPeriodo();
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;

  const [archivoTarifario, setArchivoTarifario] = useState<File | null>(null);
  const [archivoBigQuery, setArchivoBigQuery] = useState<File | null>(null);
  // Hrs_Dev (iSoat, Seguros del Estado): no está confirmado si se cobra; por defecto entra.
  const [cobrarHrsDev, setCobrarHrsDev] = useState(true);
  const [importacion, setImportacion] = useState<ResultadoImportacion | null>(null);
  const [resumen, setResumen] = useState<ResumenLiquidacion | null>(null);
  const [filtroMotivo, setFiltroMotivo] = useState('');
  const [archivoHistorico, setArchivoHistorico] = useState<File | null>(null);
  const [historico, setHistorico] = useState<ResultadoHistorico | null>(null);

  // Histórico de Data: solo alimenta alertas y gráficas, no liquida ni crea cobros.
  const cargarHistorico = useMutation({
    mutationFn: (archivo: File) => api.upload<ResultadoHistorico>('/variaciones/historico', formulario(archivo)),
    onSuccess: (r) => {
      setHistorico(r);
      qc.invalidateQueries({ queryKey: ['alertas'] });
      qc.invalidateQueries({ queryKey: ['variaciones'] });
      if (r.errores.length) toast.error(`${r.periodos.length} mes(es) cargados; ${r.errores.length} con error.`);
      else toast.exito(`${r.periodos.length} mes(es) de transacciones cargados. Las alertas ya se recalcularon.`);
    },
    onError: (e) => toast.error(mensajeError(e, 'No se pudo cargar el histórico')),
  });

  const importar = useMutation({
    mutationFn: (archivo: File) => api.upload<ResultadoImportacion>('/empalme/tarifario', formulario(archivo)),
    onSuccess: (r) => {
      setImportacion(r);
      const cargados = r.contratosCreados + r.contratosActualizados;
      if (r.errores.length) toast.error(`${cargados} contrato(s) cargados; ${r.errores.length} con error — revisar la lista.`);
      else toast.exito(`${cargados} contrato(s) cargados sin errores.`);
    },
    onError: (e) => toast.error(mensajeError(e, 'No se pudo importar el tarifario')),
  });

  const estadoBq = useQuery({
    queryKey: ['empalme-bigquery'],
    queryFn: () => api.get<EstadoBigQuery>('/empalme/bigquery/estado'),
    enabled: puedeEditar,
  });
  const bqListo = !!estadoBq.data?.configurado;

  // Fuente de los volúmenes: consulta directa a BigQuery o, como respaldo, el CSV descargado.
  const liquidar = useMutation({
    mutationFn: (archivo: File | null) =>
      archivo
        ? api.upload<ResumenLiquidacion>('/empalme/liquidar', formulario(archivo, { periodo, excluirHrsDev: String(!cobrarHrsDev) }))
        : api.post<ResumenLiquidacion>('/empalme/liquidar-bigquery', { periodo, excluirHrsDev: !cobrarHrsDev }),
    onSuccess: (r) => {
      setResumen(r);
      qc.invalidateQueries({ queryKey: ['empalme-pendientes'] });
      qc.invalidateQueries({ queryKey: ['preliquidados'] });
      toast.exito(`Periodo ${MESES[mes - 1]} ${anio}: ${r.liquidados} cobro(s) calculados.`);
    },
    onError: (e) => toast.error(mensajeError(e, 'No se pudo liquidar el periodo')),
  });

  const pendientes = useQuery({
    queryKey: ['empalme-pendientes', anio, mes],
    queryFn: () => api.get<EmpalmePendiente[]>('/empalme/pendientes', { anio, mes }),
  });

  const conteo = useMemo(() => {
    const m = new Map<string, { registros: number; transacciones: number }>();
    for (const p of pendientes.data ?? []) {
      const c = m.get(p.motivo) ?? { registros: 0, transacciones: 0 };
      c.registros++;
      c.transacciones += p.cantidad;
      m.set(p.motivo, c);
    }
    return m;
  }, [pendientes.data]);

  const filas = (pendientes.data ?? []).filter((p) => !filtroMotivo || p.motivo === filtroMotivo);
  const porcentaje = resumen && resumen.transacciones > 0 ? (resumen.transaccionesLiquidadas / resumen.transacciones) * 100 : 0;

  return (
    <div>
      <PageHeader
        titulo="Empalme Data ↔ Contabilidad"
        subtitulo="Cruza las transacciones de BigQuery con los contratos y genera el pre-liquidado del mes"
      />

      {puedeEditar && (
        <div className={styles.pasos}>
          {/* Paso 1: tarifario */}
          <section className="card">
            <h2 className={styles.paso}>1 · Tarifario de Contabilidad</h2>
            <p className={styles.ayuda}>
              CSV con separador <code>;</code> en el formato acordado. Volver a importar un contrato lo actualiza (no lo
              duplica); los precios de cada año del archivo reemplazan a los del sistema para ese año.
            </p>
            <div className={styles.accion}>
              <input
                type="file"
                accept=".csv,text/csv"
                className="input"
                aria-label="Archivo del tarifario"
                onChange={(e) => setArchivoTarifario(e.target.files?.[0] ?? null)}
              />
              <button
                className="btn btn-secondary"
                disabled={!archivoTarifario || importar.isPending}
                onClick={() => archivoTarifario && importar.mutate(archivoTarifario)}
              >
                <FileUp size={16} /> {importar.isPending ? 'Importando…' : 'Importar tarifario'}
              </button>
            </div>

            {importacion && (
              <>
                <div className={styles.cifras}>
                  <span><strong>{importacion.contratosCreados}</strong> contratos nuevos</span>
                  <span><strong>{importacion.contratosActualizados}</strong> actualizados</span>
                  <span><strong>{importacion.clientesCreados}</strong> clientes nuevos</span>
                  {importacion.esperandoRetenciones > 0 && (
                    <span className={styles.malo}><strong>{importacion.esperandoRetenciones}</strong> con retenciones pendientes (no se liquidan hasta completarlas en Clientes)</span>
                  )}
                  <span className={importacion.errores.length ? styles.malo : undefined}>
                    <strong>{importacion.errores.length}</strong> con error
                  </span>
                </div>
                {importacion.serviciosNoMedidos?.length > 0 && (
                  <div className={styles.aviso}>
                    <TriangleAlert size={16} />
                    <div>
                      {importacion.serviciosNoMedidos.length} servicio(s) no los mide Data: quedaron en los contratos con su
                      tarifa, pero se cobran a mano: {importacion.serviciosNoMedidos.join(', ')}.
                    </div>
                  </div>
                )}
                {importacion.errores.length > 0 && (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="right" style={{ width: 70 }}>Fila</th>
                          <th>Contrato</th>
                          <th>Qué corregir</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importacion.errores.map((e, i) => (
                          <tr key={i}>
                            <td className="right num">{e.fila || '—'}</td>
                            <td className="mono">{e.contratoId || '—'}</td>
                            <td>{e.mensaje}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Paso 2: liquidar */}
          <section className="card">
            <h2 className={styles.paso}>2 · Liquidar el periodo</h2>
            <p className={styles.ayuda}>
              Toma las transacciones del mes de BigQuery (vista <code>Final_View-Consolidate</code>) y calcula los cobros.
              Se puede volver a liquidar: lo ya aprobado o facturado no se toca.
            </p>
            <div className={styles.accion}>
              <select className="select" value={mes} onChange={(e) => setMes(Number(e.target.value))} aria-label="Mes" style={{ width: 'auto' }}>
                {MESES.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
              <select className="select" value={anio} onChange={(e) => setAnio(Number(e.target.value))} aria-label="Año" style={{ width: 'auto' }}>
                {[2025, 2026, 2027].map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <button
                className="btn btn-primary"
                disabled={!bqListo || liquidar.isPending}
                onClick={() => liquidar.mutate(null)}
                title={bqListo ? undefined : 'Falta configurar la cuenta de servicio de BigQuery'}
              >
                <Database size={16} /> {liquidar.isPending ? 'Liquidando…' : `Consultar BigQuery y liquidar ${MESES[mes - 1]} ${anio}`}
              </button>
            </div>
            <label className={styles.nota} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <input type="checkbox" checked={cobrarHrsDev} onChange={(e) => setCobrarHrsDev(e.target.checked)} />
              Cobrar las horas de desarrollo de iSoat (Hrs_Dev, Seguros del Estado). Desmárquelo si no se deben cobrar este mes.
            </label>
            {estadoBq.data && !bqListo && (
              <p className={styles.nota}>
                La consulta directa a BigQuery aún no está configurada (falta la cuenta de servicio de Data). Mientras
                tanto, use el archivo exportado.
              </p>
            )}

            <details className={styles.respaldo} open={estadoBq.data ? !bqListo : false}>
              <summary>Respaldo: liquidar con el archivo CSV exportado de BigQuery</summary>
              <div className={styles.accion}>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="input"
                  aria-label="Archivo de BigQuery"
                  onChange={(e) => setArchivoBigQuery(e.target.files?.[0] ?? null)}
                />
                <button
                  className="btn btn-secondary"
                  disabled={!archivoBigQuery || liquidar.isPending}
                  onClick={() => archivoBigQuery && liquidar.mutate(archivoBigQuery)}
                >
                  <FileUp size={16} /> Liquidar con el archivo
                </button>
              </div>
            </details>

            {resumen && (
              <>
                <div className={styles.cifras}>
                  <span className="badge badge-neutral">{resumen.origen === 'csv' ? 'Desde archivo CSV' : 'Consulta directa a BigQuery'}</span>
                  <span><strong>{formatearNumero(resumen.transacciones)}</strong> transacciones en BigQuery ({formatearNumero(resumen.nits)} NIT)</span>
                  <span><strong>{porcentaje.toFixed(1)}%</strong> empalmadas</span>
                  <span><strong>{resumen.liquidados}</strong> cobros calculados</span>
                  <span>Total a facturar: <strong>{formatearMoneda(resumen.totalFacturado)}</strong></span>
                  {resumen.bloqueados > 0 && <span><strong>{resumen.bloqueados}</strong> ya aprobados (sin cambios)</span>}
                </div>

                {resumen.aprobadosConCambio.length > 0 && (
                  <div className={styles.aviso}>
                    <TriangleAlert size={16} />
                    <div>
                      <strong>Cobros ya aprobados cuyo recálculo da otro valor.</strong> El sistema no los modificó; revíselos:
                      <ul>
                        {resumen.aprobadosConCambio.map((a) => (
                          <li key={a.preLiquidadoId}>
                            {a.cliente}: aprobado {formatearMoneda(a.totalAprobado)} → ahora {formatearMoneda(a.totalNuevo)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {resumen.hrsDev.cantidad > 0 && (
                  <div className={styles.aviso}>
                    <TriangleAlert size={16} />
                    <div>
                      {formatearNumero(resumen.hrsDev.cantidad)} transacciones de horas de desarrollo (Hrs_Dev, iSoat){' '}
                      {resumen.hrsDev.excluido ? 'NO se cobraron en esta liquidación.' : 'se sumaron al cobro de iSoat - Emision.'}
                    </div>
                  </div>
                )}
                {resumen.ajustesNegativos.length > 0 && (
                  <div className={styles.aviso}>
                    <TriangleAlert size={16} />
                    <div>
                      BigQuery trae {resumen.ajustesNegativos.length} fila(s) con cantidad negativa (ajustes de Data); se
                      restaron del total:{' '}
                      {resumen.ajustesNegativos.map((a) => `NIT ${a.nit} ${a.servicio} ${formatearNumero(a.cantidad)}`).join(' · ')}
                    </div>
                  </div>
                )}
                {resumen.itemsSinCodigoData.length > 0 && (
                  <div className={styles.aviso}>
                    <TriangleAlert size={16} />
                    <div>
                      {resumen.itemsSinCodigoData.length} item(s) de contrato son de servicios que Data no mide: no se
                      liquidan solos, se cobran a mano: {[...new Set(resumen.itemsSinCodigoData.map((i) => i.contrato))].join(', ')}.
                    </div>
                  </div>
                )}

                <Link to="/pre-liquidado" className={`btn btn-secondary btn-sm ${styles.ir}`}>
                  Revisar y aprobar en Pre-liquidado <ArrowRight size={14} />
                </Link>
              </>
            )}
          </section>

          {/* Paso 3: histórico para alertas */}
          <section className="card">
            <h2 className={styles.paso}>3 · Histórico de transacciones (alertas)</h2>
            <p className={styles.ayuda}>
              Export de BigQuery con uno o varios meses (por ejemplo, el año hasta ayer). Solo alimenta las alertas de
              variación y la gráfica de cada cliente: <strong>no liquida ni crea cobros</strong>. Cada mes del archivo
              reemplaza al que ya estaba cargado.
            </p>
            <div className={styles.accion}>
              <input
                type="file"
                accept=".csv,text/csv"
                className="input"
                aria-label="Archivo del histórico"
                onChange={(e) => setArchivoHistorico(e.target.files?.[0] ?? null)}
              />
              <button
                className="btn btn-secondary"
                disabled={!archivoHistorico || cargarHistorico.isPending}
                onClick={() => archivoHistorico && cargarHistorico.mutate(archivoHistorico)}
              >
                <FileUp size={16} /> {cargarHistorico.isPending ? 'Cargando…' : 'Cargar histórico'}
              </button>
            </div>
            {historico && (
              <div className={styles.cifras}>
                {historico.periodos.map((p) => (
                  <span key={p.periodo}>
                    <strong>{p.periodo}</strong> {p.transacciones.toLocaleString('es-CO')} trx{p.hasta.endsWith(String(new Date(Number(p.periodo.slice(0, 4)), Number(p.periodo.slice(5)), 0).getDate())) ? '' : ` (hasta el ${Number(p.hasta.slice(8))})`}
                  </span>
                ))}
                {historico.errores.map((e) => (
                  <span key={e.periodo} className={styles.malo}><strong>{e.periodo}</strong> {e.mensaje}</span>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Lo que no empalmó */}
      <section>
        <div className={styles.encabezado}>
          <h2 className={styles.paso}>Lo que no se pudo cobrar · {MESES[mes - 1]} {anio}</h2>
          {!puedeEditar && (
            <div className={styles.accion}>
              <select className="select" value={mes} onChange={(e) => setMes(Number(e.target.value))} aria-label="Mes" style={{ width: 'auto' }}>
                {MESES.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
              <select className="select" value={anio} onChange={(e) => setAnio(Number(e.target.value))} aria-label="Año" style={{ width: 'auto' }}>
                {[2025, 2026, 2027].map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {conteo.size > 0 && (
          <div className={styles.chips}>
            <button className={`badge ${filtroMotivo === '' ? 'badge-primary' : 'badge-neutral'}`} onClick={() => setFiltroMotivo('')}>
              Todos ({pendientes.data?.length})
            </button>
            {[...conteo].map(([motivo, c]) => (
              <button
                key={motivo}
                className={`badge ${filtroMotivo === motivo ? 'badge-primary' : 'badge-warn'}`}
                onClick={() => setFiltroMotivo(motivo)}
                title={`${formatearNumero(c.transacciones)} transacciones`}
              >
                {etiquetaMotivo(motivo)} ({c.registros})
              </button>
            ))}
          </div>
        )}

        {pendientes.isError ? (
          <ErrorState mensaje="No se pudo cargar lo pendiente del periodo" />
        ) : pendientes.isLoading ? (
          <Spinner label="Cargando…" />
        ) : filas.length === 0 ? (
          <div className="card">
            <EmptyState
              titulo={pendientes.data?.length === 0 ? 'Nada pendiente para este periodo' : 'Sin registros con este motivo'}
              descripcion="Si el periodo aún no se ha liquidado, esta lista estará vacía."
            />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>NIT</th>
                  <th>Servicio (Data)</th>
                  <th className="right">Transacciones</th>
                  <th>Motivo</th>
                  <th className={styles.queHacer}>Qué hacer</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.nit}</td>
                    <td className={styles.servicio}>{p.servicio}</td>
                    <td className="right num">{formatearNumero(p.cantidad)}</td>
                    <td><span className="badge badge-warn">{etiquetaMotivo(p.motivo)}</span></td>
                    <td className={`muted ${styles.queHacer}`}>{p.detalle ?? MOTIVO_PENDIENTE[p.motivo]?.accion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
