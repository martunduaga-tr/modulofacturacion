import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, CircleCheck, CircleX, Download, FileCheck, TriangleAlert } from 'lucide-react';
import { api, ApiError, descargarArchivo } from '../lib/api';
import { useUltimoPeriodo } from '../hooks/useUltimoPeriodo';
import type { PaginatedResult, PreLiquidado, TrmDia } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { etiquetaModelo, formatearMoneda, formatearNumero, formatearUsd } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { Money } from '../components/ui/Money';
import { EstadoBadge } from '../components/ui/Badges';
import { Spinner, ErrorState, EmptyState } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/ToastProvider';
import styles from './PreLiquidadoPage.module.css';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Valores como salen en la factura electrónica (pesos enteros); los cálculos anteriores al empalme no los tienen. */
const subtotalDe = (p: PreLiquidado) => p.subtotalFactura ?? p.subtotal;
const totalDe = (p: PreLiquidado) => p.totalFactura ?? p.total;
const ivaDe = (p: PreLiquidado) => p.ivaFactura ?? p.iva;
// Solo para mostrar: se redondea a centavos para no arrastrar residuos de punto flotante de la resta.
const carteraDe = (p: PreLiquidado) => Math.round((totalDe(p) - p.rtefte - p.rteica - p.rteiva) * 100) / 100;

function serviciosDe(p: PreLiquidado): string {
  try {
    const d = p.desglose ? (JSON.parse(p.desglose) as { servicios?: string[] }) : null;
    return d?.servicios?.join(' + ') ?? '';
  } catch {
    return '';
  }
}

function serviciosLista(p: PreLiquidado): string[] {
  try {
    const d = p.desglose ? (JSON.parse(p.desglose) as { servicios?: string[] }) : null;
    return d?.servicios ?? [];
  } catch {
    return [];
  }
}

/** Unidad de negocio (la Vertical de Data) a partir del nombre del servicio. */
function unidadDe(servicio: string): string {
  const s = servicio.toLowerCase();
  if (s.startsWith('ifactura')) return 'iFactura';
  if (s.startsWith('idocumentos')) return 'iDocumentos';
  if (s.startsWith('irecaudo')) return 'iRecaudo';
  if (s.startsWith('isalud')) return 'iSalud';
  if (s.startsWith('iseguros')) return 'iSeguros';
  if (s.startsWith('isoat')) return 'iSoat';
  return 'No medido por Data';
}

/** Sin acentos ni mayúsculas, para buscar «clinica» y encontrar «CLÍNICA». */
const normalizar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function tieneAnomalia(p: PreLiquidado): boolean {
  if (!p.anomalias) return false;
  try {
    return (JSON.parse(p.anomalias) as unknown[]).length > 0;
  } catch {
    return false;
  }
}

export function PreLiquidadoPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const puedeAprobar = user?.rol === 'administrador' || user?.rol === 'editor';

  const { anio, mes, setAnio, setMes } = useUltimoPeriodo();
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroServicio, setFiltroServicio] = useState('');
  const [filtroUnidad, setFiltroUnidad] = useState('');
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [detalle, setDetalle] = useState<PreLiquidado | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [rechazando, setRechazando] = useState<PreLiquidado | null>(null);
  const [motivo, setMotivo] = useState('');
  const [facturando, setFacturando] = useState<PreLiquidado | null>(null);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['preliquidados', anio, mes, filtroEstado],
    queryFn: () =>
      api.get<PaginatedResult<PreLiquidado>>('/pre-liquidados', {
        anio,
        mes,
        estado: filtroEstado || undefined,
        limit: 1000,
      }),
  });

  const todas = useMemo(() => data?.data ?? [], [data]);

  // Opciones de los filtros: solo lo que hay en el periodo.
  const servicios = useMemo(() => [...new Set(todas.flatMap(serviciosLista))].sort((a, b) => a.localeCompare(b, 'es')), [todas]);
  const unidades = useMemo(() => [...new Set(servicios.map(unidadDe))].sort((a, b) => a.localeCompare(b, 'es')), [servicios]);

  // Filtros en pantalla (el mes completo ya está cargado). Lo seleccionado para aprobar
  // también se limita a lo que se ve: nunca se aprueba algo que el filtro esconde.
  const filas = useMemo(() => {
    const q = normalizar(filtroCliente.trim());
    return todas.filter((p) => {
      const sv = serviciosLista(p);
      if (q && !normalizar(`${p.cliente.razonSocial} ${p.cliente.nit}`).includes(q)) return false;
      if (filtroServicio && !sv.includes(filtroServicio)) return false;
      if (filtroUnidad && !sv.some((x) => unidadDe(x) === filtroUnidad)) return false;
      return true;
    });
  }, [todas, filtroCliente, filtroServicio, filtroUnidad]);
  const hayFiltros = !!(filtroCliente || filtroServicio || filtroUnidad);

  const resumen = useMemo(() => {
    const cartera = filas.reduce((s, p) => s + carteraDe(p), 0);
    const porAprobar = filas.filter((p) => p.estado === 'calculado').length;
    const anomalias = filas.filter(tieneAnomalia).length;
    return { total: filas.length, cartera, porAprobar, anomalias };
  }, [filas]);

  // En lote: los calculados se aprueban y los aprobados se marcan como facturados.
  const seleccionables = filas.filter((p) => p.estado === 'calculado' || p.estado === 'aprobado');
  const selCalculados = seleccionables.filter((p) => sel.has(p.id) && p.estado === 'calculado');
  const selAprobados = seleccionables.filter((p) => sel.has(p.id) && p.estado === 'aprobado');
  const totalSel = selCalculados.length + selAprobados.length;
  const [facturandoLote, setFacturandoLote] = useState(false);
  const [descargando, setDescargando] = useState(false);

  // Descarga lo que se ve (periodo + filtros), en el mismo orden, para digitar o cargar las facturas en iFactura.
  async function descargar() {
    setDescargando(true);
    try {
      const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
      await descargarArchivo('/pre-liquidados/exportar', { ids: filas.map((p) => p.id) }, `cobros_${periodo}${filtroEstado ? `_${filtroEstado}` : ''}.csv`);
      toast.exito(`${filas.length} cobro(s) descargados.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo descargar el archivo');
    } finally {
      setDescargando(false);
    }
  }

  const aprobar = useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map((id) => api.patch(`/pre-liquidados/${id}/aprobar`))),
    onSuccess: (_data, ids) => {
      setSel(new Set());
      setConfirmar(false);
      setDetalle(null);
      qc.invalidateQueries({ queryKey: ['preliquidados'] });
      toast.exito(ids.length === 1 ? 'Pre-liquidado aprobado.' : `${ids.length} pre-liquidados aprobados.`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo aprobar'),
  });

  const rechazar = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => api.patch(`/pre-liquidados/${id}/rechazar`, { motivo }),
    onSuccess: () => {
      setRechazando(null);
      setMotivo('');
      setDetalle(null);
      qc.invalidateQueries({ queryKey: ['preliquidados'] });
      toast.exito('Pre-liquidado rechazado. Se recalcula en la próxima liquidación del periodo.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo rechazar'),
  });

  function toggle(id: number) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleTodos() {
    if (totalSel === seleccionables.length) setSel(new Set());
    else setSel(new Set(seleccionables.map((p) => p.id)));
  }

  return (
    <div>
      <PageHeader
        titulo="Pre-liquidado"
        subtitulo="Montos calculados del mes — revisar y aprobar antes de emitir"
        acciones={
          puedeAprobar && (
            <Link to="/empalme" className="btn btn-primary">
              <ArrowLeftRight size={18} /> Liquidar con BigQuery
            </Link>
          )
        }
      />

      {/* Periodo + resumen sobrio */}
      <div className={styles.barra}>
        <div className={styles.periodo}>
          <select className="select" value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ width: 'auto' }}>
            {MESES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select className="select" value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: 'auto' }}>
            {[2024, 2025, 2026, 2027].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select className="select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todos los estados</option>
            <option value="calculado">Por aprobar</option>
            <option value="aprobado">Aprobados</option>
            <option value="rechazado">Rechazados</option>
            <option value="facturado">Facturados</option>
          </select>
          <select className="select" value={filtroUnidad} onChange={(e) => setFiltroUnidad(e.target.value)} style={{ width: 'auto' }} aria-label="Unidad de negocio">
            <option value="">Todas las unidades</option>
            {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select className="select" value={filtroServicio} onChange={(e) => setFiltroServicio(e.target.value)} style={{ width: 'auto', maxWidth: 260 }} aria-label="Servicio">
            <option value="">Todos los servicios</option>
            {servicios
              .filter((x) => !filtroUnidad || unidadDe(x) === filtroUnidad)
              .map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <input
            className="input"
            style={{ width: 240 }}
            placeholder="Cliente o NIT"
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
            aria-label="Buscar cliente o NIT"
          />
          {hayFiltros && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFiltroCliente(''); setFiltroServicio(''); setFiltroUnidad(''); }}>
              Quitar filtros
            </button>
          )}
        </div>
        {data && (
          <div className={styles.resumen}>
            <span><strong>{resumen.total}</strong> registros{hayFiltros ? ` de ${todas.length}` : ''}</span>
            {filas.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={descargar} disabled={descargando} title="Descarga los cobros que se ven, con la descripción de la línea de factura">
                <Download size={16} /> {descargando ? 'Descargando…' : 'Descargar CSV'}
              </button>
            )}
            <span>Cartera: <strong>{formatearMoneda(resumen.cartera)}</strong></span>
            <span className={styles.porAprobar}>{resumen.porAprobar} por aprobar</span>
            {resumen.anomalias > 0 && (
              <span className={styles.anom}><TriangleAlert size={14} /> {resumen.anomalias} con anomalía</span>
            )}
          </div>
        )}
      </div>

      {puedeAprobar && totalSel > 0 && (
        <div className={styles.accionLote}>
          <span>{totalSel} seleccionado(s)</span>
          {selCalculados.length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => setConfirmar(true)}>
              <CircleCheck size={16} /> Aprobar {selCalculados.length}
            </button>
          )}
          {selAprobados.length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => setFacturandoLote(true)}>
              <FileCheck size={16} /> Marcar {selAprobados.length} como facturado(s)
            </button>
          )}
        </div>
      )}

      {isError ? (
        <ErrorState mensaje="No se pudieron cargar los pre-liquidados" />
      ) : isLoading ? (
        <Spinner label="Cargando…" />
      ) : filas.length === 0 ? (
        <div className="card">
          <EmptyState
            titulo="Sin pre-liquidados para este periodo"
            descripcion={puedeAprobar ? 'Usa "Liquidar con BigQuery" para generarlos a partir de las transacciones del mes.' : 'Aún no se ha calculado este periodo.'}
          />
        </div>
      ) : (
        <div className="table-wrap" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 120ms' }}>
          <table className="table">
            <thead>
              <tr>
                {puedeAprobar && (
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={totalSel > 0 && totalSel === seleccionables.length} onChange={toggleTodos} aria-label="Seleccionar todos" />
                  </th>
                )}
                <th>Cliente</th>
                <th>Servicios</th>
                <th className="right">Volumen</th>
                <th className="right">Subtotal</th>
                <th className="right">Total</th>
                <th className="right">Valor cartera</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => setDetalle(p)}>
                  {puedeAprobar && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        disabled={p.estado !== 'calculado' && p.estado !== 'aprobado'}
                        checked={sel.has(p.id)}
                        onChange={() => toggle(p.id)}
                        aria-label={`Seleccionar ${p.cliente.razonSocial}`}
                      />
                    </td>
                  )}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {tieneAnomalia(p) && <TriangleAlert size={14} color="var(--warn)" aria-label="anomalía" />}
                      <span style={{ fontWeight: 500 }}>{p.cliente.razonSocial}</span>
                    </div>
                  </td>
                  <td className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                    {serviciosDe(p)}
                    {p.moneda === 'USD' && (
                      <span
                        className="badge badge-plain badge-accent"
                        style={{ marginLeft: 6 }}
                        title={`${formatearUsd(p.subtotalMoneda)} × TRM ${formatearNumero(p.trm)}${p.trmDefinitiva ? '' : ' (estimada)'}`}
                      >
                        USD
                      </span>
                    )}
                  </td>
                  <td className="right num">{formatearNumero(p.volumen)}</td>
                  <td className="right"><Money valor={subtotalDe(p)} /></td>
                  <td className="right"><Money valor={totalDe(p)} /></td>
                  <td className="right" style={{ fontWeight: 600 }}><Money valor={carteraDe(p)} decimales={2} /></td>
                  <td><EstadoBadge estado={p.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <DesgloseModal
          p={detalle}
          puedeAprobar={puedeAprobar}
          aprobando={aprobar.isPending}
          onAprobar={() => aprobar.mutate([detalle.id])}
          onRechazar={() => setRechazando(detalle)}
          onFacturar={() => setFacturando(detalle)}
          onClose={() => setDetalle(null)}
        />
      )}

      {facturando && (
        <FacturarModal
          p={facturando}
          onClose={() => setFacturando(null)}
          onListo={(p) => {
            setFacturando(null);
            setDetalle(p);
            qc.invalidateQueries({ queryKey: ['preliquidados'] });
          }}
        />
      )}

      {rechazando && (
        <Modal
          titulo="Rechazar pre-liquidado"
          onClose={() => setRechazando(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setRechazando(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                disabled={!motivo.trim() || rechazar.isPending}
                onClick={() => rechazar.mutate({ id: rechazando.id, motivo })}
              >
                {rechazar.isPending ? 'Rechazando…' : 'Rechazar'}
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            <strong>{rechazando.cliente.razonSocial}</strong> · <Money valor={totalDe(rechazando)} />. No se emitirá. Indique
            qué está mal para que se corrija el contrato o los datos.
          </p>
          <label className="field">
            <span className="field-label">Motivo del rechazo</span>
            <textarea
              className="input"
              rows={3}
              style={{ height: 'auto', paddingTop: 'var(--space-2)' }}
              maxLength={500}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. la tarifa no corresponde al otrosí vigente"
              autoFocus
            />
          </label>
        </Modal>
      )}

      {confirmar && (
        <Modal
          titulo="Aprobar pre-liquidados"
          onClose={() => setConfirmar(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirmar(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                disabled={aprobar.isPending}
                onClick={() => aprobar.mutate(selCalculados.map((p) => p.id))}
              >
                {aprobar.isPending ? 'Aprobando…' : `Aprobar ${selCalculados.length}`}
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            Vas a aprobar <strong>{selCalculados.length}</strong> pre-liquidado(s). Quedan marcados como aprobados
            y listos para emitir. Esta acción no emite todavía.
          </p>
        </Modal>
      )}

      {facturandoLote && (
        <FacturarLoteModal
          cobros={selAprobados}
          onClose={() => setFacturandoLote(false)}
          onListo={(facturados) => {
            setSel((prev) => new Set([...prev].filter((id) => !facturados.includes(id))));
            qc.invalidateQueries({ queryKey: ['preliquidados'] });
          }}
        />
      )}
    </div>
  );
}

function fila(label: string, valor: ReactNode, resta = false) {
  return (
    <div className={styles.dRow}>
      <span className={styles.dLabel}>{label}</span>
      <span className={styles.dVal}>{resta ? '− ' : ''}{valor}</span>
    </div>
  );
}

function DesgloseModal({
  p,
  puedeAprobar,
  aprobando,
  onAprobar,
  onRechazar,
  onFacturar,
  onClose,
}: {
  p: PreLiquidado;
  puedeAprobar: boolean;
  aprobando: boolean;
  onAprobar: () => void;
  onRechazar: () => void;
  onFacturar: () => void;
  onClose: () => void;
}) {
  // Anomalías del motor anterior traen `mensaje`; las del empalme solo `tipo`.
  const anomalias: { tipo?: string; mensaje?: string }[] = p.anomalias ? JSON.parse(p.anomalias) : [];
  const textoAnomalia = (a: { tipo?: string; mensaje?: string }) =>
    a.mensaje ?? (a.tipo === 'volumen_cero' ? 'Sin transacciones en el periodo: se cobra el mínimo o fijo del contrato.' : a.tipo);
  return (
    <Modal
      titulo={p.cliente.razonSocial}
      onClose={onClose}
      maxWidth={520}
      footer={
        puedeAprobar && p.estado === 'calculado' ? (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
            <button className="btn btn-secondary" onClick={onRechazar}>
              <CircleX size={16} /> Rechazar
            </button>
            <button className="btn btn-primary" disabled={aprobando} onClick={onAprobar}>
              <CircleCheck size={16} /> {aprobando ? 'Aprobando…' : 'Aprobar'}
            </button>
          </>
        ) : puedeAprobar && p.estado === 'aprobado' ? (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
            <button className="btn btn-primary" onClick={onFacturar}>
              <FileCheck size={16} /> Marcar como facturado
            </button>
          </>
        ) : (
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        )
      }
    >
      <div className={styles.dHead}>
        <EstadoBadge estado={p.estado} />
        <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          {etiquetaModelo(p.modeloCobro)}
        </span>
      </div>

      {anomalias.length > 0 && (
        <div className={styles.anomBox}>
          <TriangleAlert size={16} />
          <div>{anomalias.map((a, i) => <div key={i}>{textoAnomalia(a)}</div>)}</div>
        </div>
      )}

      <div className={styles.desglose}>
        {p.tarifaUnitaria != null &&
          fila(
            'Volumen × tarifa',
            `${formatearNumero(p.volumen)} × ${p.moneda === 'USD' ? formatearUsd(p.tarifaUnitaria) : formatearMoneda(p.tarifaUnitaria, 2)}`,
          )}
        {p.moneda === 'USD' && (
          <>
            {fila('Subtotal en dólares', formatearUsd(p.subtotalMoneda))}
            {fila(
              p.trmDefinitiva ? `TRM del día de la factura (${p.fechaTrm})` : `TRM estimada (${p.fechaTrm}), se fija al facturar`,
              formatearMoneda(p.trm, 2),
            )}
          </>
        )}
        {p.recargoFijo > 0 && fila('Recargo fijo (ej. mantenimiento)', <Money valor={p.recargoFijo} />)}
        {fila('Subtotal', <Money valor={subtotalDe(p)} />)}
        {fila(`IVA (${(p.tasaIva * 100).toFixed(0)}%)`, <Money valor={ivaDe(p)} />)}
        <div className={styles.dSep} />
        {fila('Total factura', <strong><Money valor={totalDe(p)} /></strong>)}
        {fila(`RteFte (${(p.tasaRtefte * 100).toFixed(1)}%)`, <Money valor={p.rtefte} decimales={2} />, true)}
        {fila(`RteICA (${(p.tasaRteica * 100).toFixed(3)}%)`, <Money valor={p.rteica} decimales={2} />, true)}
        {fila(`RteIVA (${(p.tasaRteiva * 100).toFixed(0)}%)`, <Money valor={p.rteiva} decimales={2} />, true)}
        <div className={styles.dSep} />
        {fila('Valor cartera', <strong><Money valor={carteraDe(p)} decimales={2} /></strong>)}
        {fila(`Autorretención (${(p.tasaAutorretencion * 100).toFixed(1)}%)`, <><Money valor={p.autorretencion} /> <span className="muted">informativa</span></>)}
      </div>
      {p.estado === 'facturado' && p.fechaFactura && (
        <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
          Facturado el {p.fechaFactura}
          {p.usuarioFacturo ? ` por ${p.usuarioFacturo}` : ''}.
        </p>
      )}
      {p.usuarioAprobo && (
        <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
          Aprobado por {p.usuarioAprobo}.
        </p>
      )}
      {p.estado === 'rechazado' && p.motivoRechazo && (
        <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
          Rechazado por {p.usuarioRechazo}: {p.motivoRechazo}
        </p>
      )}
    </Modal>
  );
}

/** Fecha de hoy en Colombia (AAAA-MM-DD). */
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

/** "3.157,94" o "3157.94" → 3157.94; vacío → null. */
function leerTrm(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
}

/**
 * La factura se emitió: se marca con su fecha. Si el cobro es en USD, la TRM es
 * la del día de la factura (la oficial; Contabilidad la puede corregir).
 */
function FacturarModal({ p, onClose, onListo }: { p: PreLiquidado; onClose: () => void; onListo: (p: PreLiquidado) => void }) {
  const toast = useToast();
  const usd = p.moneda === 'USD';
  const [fecha, setFecha] = useState(hoy());
  const [trmTexto, setTrmTexto] = useState('');
  const oficial = useQuery({
    queryKey: ['trm', fecha],
    queryFn: () => api.get<TrmDia>('/trm', { fecha }),
    enabled: usd && /^\d{4}-\d{2}-\d{2}$/.test(fecha),
    retry: false,
  });
  const trmDigitada = leerTrm(trmTexto);
  const trm = trmDigitada ?? oficial.data?.valor ?? null;
  const trmValida = !usd || (trm != null && Number.isFinite(trm) && trm > 0);

  const facturar = useMutation({
    mutationFn: () =>
      api.patch<PreLiquidado>(`/pre-liquidados/${p.id}/facturar`, {
        fechaFactura: fecha,
        ...(usd && trmDigitada != null ? { trm: trmDigitada } : {}),
      }),
    onSuccess: (r) => {
      toast.exito(`Marcado como facturado el ${fecha}.`);
      onListo({ ...p, ...r });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo marcar como facturado'),
  });

  return (
    <Modal
      titulo="Marcar como facturado"
      onClose={onClose}
      maxWidth={460}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!fecha || !trmValida || facturar.isPending} onClick={() => facturar.mutate()}>
            {facturar.isPending ? 'Guardando…' : 'Marcar como facturado'}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        <strong>{p.cliente.razonSocial}</strong>
        {usd && <> · {formatearUsd(p.subtotalMoneda)} antes de IVA</>}
      </p>
      <label className="field">
        <span className="field-label">Fecha de la factura</span>
        <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>
      {usd && (
        <>
          <label className="field">
            <span className="field-label">TRM del día de la factura</span>
            <input
              className="input"
              inputMode="decimal"
              value={trmTexto}
              placeholder={oficial.data ? formatearNumero(oficial.data.valor) : oficial.isLoading ? 'Consultando…' : 'Digite la TRM'}
              onChange={(e) => setTrmTexto(e.target.value)}
            />
          </label>
          <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
            {oficial.data
              ? `TRM oficial del ${oficial.data.fecha}: ${formatearMoneda(oficial.data.valor, 2)}. Déjela vacía para usarla, o escriba otra.`
              : oficial.isError
                ? 'No hay TRM oficial para esa fecha: digítela.'
                : null}
          </p>
          {trmValida && trm != null && p.subtotalMoneda != null && (
            <p style={{ fontSize: 'var(--text-sm)' }}>
              Subtotal en pesos: <strong>{formatearMoneda(Math.round(p.subtotalMoneda * trm * 100) / 100, 0)}</strong>. IVA y
              retenciones se recalculan.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

/**
 * Varios cobros aprobados facturados el mismo día. Uno por uno en el servidor (cada uno queda
 * en auditoría); los USD toman la TRM oficial de esa fecha. Si alguno falla, los demás siguen
 * y se dice cuál y por qué (un USD sin TRM oficial se marca uno por uno digitando la TRM).
 */
function FacturarLoteModal({ cobros, onClose, onListo }: { cobros: PreLiquidado[]; onClose: () => void; onListo: (facturados: number[]) => void }) {
  const toast = useToast();
  const [fecha, setFecha] = useState(hoy());
  const [guardando, setGuardando] = useState(false);
  const [fallos, setFallos] = useState<{ cliente: string; mensaje: string }[] | null>(null);
  const usd = cobros.filter((p) => p.moneda === 'USD').length;
  const total = cobros.reduce((s, p) => s + totalDe(p), 0);

  async function facturar() {
    setGuardando(true);
    const ok: number[] = [];
    const malos: { cliente: string; mensaje: string }[] = [];
    for (const p of cobros) {
      try {
        await api.patch(`/pre-liquidados/${p.id}/facturar`, { fechaFactura: fecha });
        ok.push(p.id);
      } catch (e) {
        malos.push({ cliente: p.cliente.razonSocial, mensaje: e instanceof ApiError ? e.message : 'Error desconocido' });
      }
    }
    setGuardando(false);
    onListo(ok);
    if (ok.length) toast.exito(`${ok.length} cobro(s) marcados como facturados el ${fecha}.`);
    if (malos.length) setFallos(malos);
    else onClose();
  }

  return (
    <Modal
      titulo="Marcar como facturados"
      onClose={onClose}
      maxWidth={520}
      footer={
        fallos ? (
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
            <button className="btn btn-primary" disabled={!fecha || guardando} onClick={facturar}>
              {guardando ? 'Guardando…' : `Marcar ${cobros.length}`}
            </button>
          </>
        )
      }
    >
      {fallos ? (
        <>
          <p style={{ marginTop: 0 }}>Estos no se marcaron. Ábralos uno por uno para revisarlos:</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {fallos.map((f, i) => <li key={i}><strong>{f.cliente}</strong>: {f.mensaje}</li>)}
          </ul>
        </>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            <strong>{cobros.length}</strong> cobro(s) aprobados, total <strong>{formatearMoneda(total)}</strong>. Quedan cerrados con esta
            fecha de factura.
          </p>
          <label className="field">
            <span className="field-label">Fecha de la factura</span>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          {usd > 0 && (
            <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
              {usd} en USD: se pasan a pesos con la TRM oficial de esa fecha. Para usar otra TRM, márquelos uno por uno.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
