import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, CircleCheck, TriangleAlert } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { PaginatedResult, PreLiquidado } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { etiquetaModelo, formatearMoneda, formatearNumero } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { Money } from '../components/ui/Money';
import { EstadoBadge } from '../components/ui/Badges';
import { Spinner, ErrorState, EmptyState } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/ToastProvider';
import styles from './PreLiquidadoPage.module.css';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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

  const [anio, setAnio] = useState(2026);
  const [mes, setMes] = useState(1);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [detalle, setDetalle] = useState<PreLiquidado | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

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

  const filas = useMemo(() => data?.data ?? [], [data]);

  const resumen = useMemo(() => {
    const cartera = filas.reduce((s, p) => s + p.valorCartera, 0);
    const porAprobar = filas.filter((p) => p.estado === 'calculado').length;
    const anomalias = filas.filter(tieneAnomalia).length;
    return { total: filas.length, cartera, porAprobar, anomalias };
  }, [filas]);

  const seleccionables = filas.filter((p) => p.estado === 'calculado');
  const totalSel = seleccionables.filter((p) => sel.has(p.id)).length;

  const calcular = useMutation({
    mutationFn: () => api.post<{ calculados: number; errores: unknown[] }>('/pre-liquidados/calcular', { anio, mes }),
    onSuccess: (r) => {
      setMensaje(`Periodo ${MESES[mes - 1]} ${anio}: ${r.calculados} calculados, ${r.errores.length} marcados para revisión.`);
      qc.invalidateQueries({ queryKey: ['preliquidados'] });
    },
    onError: (e) => setMensaje(e instanceof ApiError ? e.message : 'No se pudo calcular'),
  });

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

  function toggle(id: number) {
    setSel((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
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
            <button className="btn btn-primary" onClick={() => calcular.mutate()} disabled={calcular.isPending}>
              <Calculator size={18} /> {calcular.isPending ? 'Calculando…' : 'Calcular periodo'}
            </button>
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
        </div>
        {data && (
          <div className={styles.resumen}>
            <span><strong>{resumen.total}</strong> registros</span>
            <span>Cartera: <strong>{formatearMoneda(resumen.cartera)}</strong></span>
            <span className={styles.porAprobar}>{resumen.porAprobar} por aprobar</span>
            {resumen.anomalias > 0 && (
              <span className={styles.anom}><TriangleAlert size={14} /> {resumen.anomalias} con anomalía</span>
            )}
          </div>
        )}
      </div>

      {mensaje && (
        <div className={styles.aviso}>{mensaje}</div>
      )}

      {puedeAprobar && totalSel > 0 && (
        <div className={styles.accionLote}>
          <span>{totalSel} seleccionado(s)</span>
          <button className="btn btn-primary btn-sm" onClick={() => setConfirmar(true)}>
            <CircleCheck size={16} /> Aprobar seleccionados
          </button>
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
            descripcion={puedeAprobar ? 'Usa "Calcular periodo" para generarlos a partir de los volúmenes cargados.' : 'Aún no se ha calculado este periodo.'}
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
                        disabled={p.estado !== 'calculado'}
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
                  <td className="right num">{formatearNumero(p.volumen)}</td>
                  <td className="right"><Money valor={p.subtotal} /></td>
                  <td className="right"><Money valor={p.total} /></td>
                  <td className="right" style={{ fontWeight: 600 }}><Money valor={p.valorCartera} /></td>
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
          onClose={() => setDetalle(null)}
        />
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
                onClick={() => aprobar.mutate(seleccionables.filter((p) => sel.has(p.id)).map((p) => p.id))}
              >
                {aprobar.isPending ? 'Aprobando…' : `Aprobar ${totalSel}`}
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            Vas a aprobar <strong>{totalSel}</strong> pre-liquidado(s). Quedan marcados como aprobados
            y listos para emitir. Esta acción no emite todavía.
          </p>
        </Modal>
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
  onClose,
}: {
  p: PreLiquidado;
  puedeAprobar: boolean;
  aprobando: boolean;
  onAprobar: () => void;
  onClose: () => void;
}) {
  const anomalias: { mensaje: string }[] = p.anomalias ? JSON.parse(p.anomalias) : [];
  return (
    <Modal
      titulo={p.cliente.razonSocial}
      onClose={onClose}
      maxWidth={520}
      footer={
        puedeAprobar && p.estado === 'calculado' ? (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
            <button className="btn btn-primary" disabled={aprobando} onClick={onAprobar}>
              <CircleCheck size={16} /> {aprobando ? 'Aprobando…' : 'Aprobar'}
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
          <div>{anomalias.map((a, i) => <div key={i}>{a.mensaje}</div>)}</div>
        </div>
      )}

      <div className={styles.desglose}>
        {p.tarifaUnitaria != null &&
          fila('Volumen × tarifa', `${formatearNumero(p.volumen)} × ${formatearMoneda(p.tarifaUnitaria, 2)}`)}
        {p.recargoFijo > 0 && fila('Recargo fijo (ej. mantenimiento)', <Money valor={p.recargoFijo} />)}
        {fila('Subtotal', <Money valor={p.subtotal} />)}
        {fila(`IVA (${(p.tasaIva * 100).toFixed(0)}%)`, <Money valor={p.iva} />)}
        <div className={styles.dSep} />
        {fila('Total', <strong><Money valor={p.total} /></strong>)}
        {fila(`RteFte (${(p.tasaRtefte * 100).toFixed(1)}%)`, <Money valor={p.rtefte} />, true)}
        {fila(`RteICA (${(p.tasaRteica * 100).toFixed(3)}%)`, <Money valor={p.rteica} />, true)}
        {fila(`RteIVA (${(p.tasaRteiva * 100).toFixed(0)}%)`, <Money valor={p.rteiva} />, true)}
        <div className={styles.dSep} />
        {fila('Valor cartera', <strong><Money valor={p.valorCartera} /></strong>)}
        {fila(`Autorretención (${(p.tasaAutorretencion * 100).toFixed(1)}%)`, <><Money valor={p.autorretencion} /> <span className="muted">informativa</span></>)}
      </div>
      {p.usuarioAprobo && (
        <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
          Aprobado por {p.usuarioAprobo}.
        </p>
      )}
    </Modal>
  );
}
