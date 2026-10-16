import { Fragment, useState, type CSSProperties } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import type { AuditoriaCambio, PaginatedResult } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { Spinner, ErrorState, EmptyState } from '../components/ui/Feedback';

const LIMIT = 25;

function AccionBadge({ accion }: { accion: string }) {
  const map: Record<string, string> = { INSERT: 'badge-ok', UPDATE: 'badge-primary', DELETE: 'badge-danger' };
  return <span className={`badge badge-plain ${map[accion] ?? 'badge-neutral'}`}>{accion}</span>;
}

function pretty(json: string | null): string {
  if (!json) return '—';
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export function AuditoriaPage() {
  const [tabla, setTabla] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [page, setPage] = useState(1);
  const [expandida, setExpandida] = useState<string | null>(null);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['auditoria', page, tabla, desde, hasta],
    queryFn: () =>
      api.get<PaginatedResult<AuditoriaCambio>>('/auditoria', {
        page,
        limit: LIMIT,
        tabla: tabla || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const reg = data?.data ?? [];

  return (
    <div>
      <PageHeader titulo="Auditoría" subtitulo={data ? `${data.total} cambios registrados` : 'Cargando…'} />

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <select className="select" style={{ width: 'auto', minWidth: 180 }} value={tabla} onChange={(e) => { setTabla(e.target.value); setPage(1); }}>
          <option value="">Todas las tablas</option>
          <option value="contratos">contratos</option>
          <option value="tarifa_escalones">tarifa_escalones</option>
          <option value="minimo_garantizado">minimo_garantizado</option>
          <option value="tarifa_fija">tarifa_fija</option>
          <option value="recargo_fijo">recargo_fijo</option>
          <option value="parametros_globales">parametros_globales</option>
        </select>
        <input className="input" type="date" style={{ width: 'auto' }} value={desde} onChange={(e) => { setDesde(e.target.value); setPage(1); }} aria-label="Desde" />
        <input className="input" type="date" style={{ width: 'auto' }} value={hasta} onChange={(e) => { setHasta(e.target.value); setPage(1); }} aria-label="Hasta" />
      </div>

      {isError ? (
        <ErrorState mensaje="No se pudo cargar la auditoría" />
      ) : isLoading ? (
        <Spinner label="Cargando…" />
      ) : reg.length === 0 ? (
        <div className="card"><EmptyState titulo="Sin cambios registrados" descripcion="Aún no hay movimientos para estos filtros." /></div>
      ) : (
        <>
          <div className="table-wrap" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 120ms' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Tabla</th>
                  <th>Acción</th>
                  <th className="right">Registro</th>
                  <th aria-label="detalle" />
                </tr>
              </thead>
              <tbody>
                {reg.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="clickable" onClick={() => setExpandida(expandida === r.id ? null : r.id)}>
                      <td className="muted">{new Date(r.fecha).toLocaleString('es-CO')}</td>
                      <td style={{ fontWeight: 500 }}>{r.usuario}</td>
                      <td className="mono">{r.tabla}</td>
                      <td><AccionBadge accion={r.accion} /></td>
                      <td className="right num">{r.registroId}</td>
                      <td className="right"><ChevronDown size={16} style={{ transform: expandida === r.id ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} /></td>
                    </tr>
                    {expandida === r.id && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--surface-sunken)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                            <div>
                              <div className="field-label" style={{ marginBottom: 4 }}>Antes</div>
                              <pre style={preStyle}>{pretty(r.valorAnterior)}</pre>
                            </div>
                            <div>
                              <div className="field-label" style={{ marginBottom: 4 }}>Después</div>
                              <pre style={preStyle}>{pretty(r.valorNuevo)}</pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>
            <span>Página {data?.page} de {data?.totalPages}</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={16} /> Anterior
              </button>
              <button className="btn btn-secondary btn-sm" disabled={!data || page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                Siguiente <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const preStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-3)',
  margin: 0,
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};
