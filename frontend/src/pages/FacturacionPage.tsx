import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import type { LineaFacturacion, PaginatedResult } from '../lib/types';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { EstadoBadge } from '../components/ui/Badges';
import { Spinner, ErrorState, EmptyState } from '../components/ui/Feedback';
import { LineaModal } from '../components/form/LineaModal';

const LIMIT = 20;

export function FacturacionPage() {
  const { user } = useAuth();
  const puedeEditar = user?.rol === 'administrador' || user?.rol === 'editor';
  const [busquedaInput, setBusquedaInput] = useState('');
  const [estado, setEstado] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ linea: LineaFacturacion | null } | null>(null);
  const busqueda = useDebounce(busquedaInput);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['lineas-facturacion', page, busqueda, estado],
    queryFn: () =>
      api.get<PaginatedResult<LineaFacturacion>>('/lineas-facturacion', {
        page,
        limit: LIMIT,
        busqueda: busqueda || undefined,
        estado: estado || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const lineas = data?.data ?? [];

  return (
    <div>
      <PageHeader
        titulo="Maestro de facturación"
        subtitulo={data ? `${data.total} líneas — cómo se factura y contabiliza a cada cliente` : 'Cargando…'}
        acciones={
          puedeEditar && (
            <button className="btn btn-primary" onClick={() => setModal({ linea: null })}>
              <Plus size={18} /> Nueva línea
            </button>
          )
        }
      />

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: 460, minWidth: 240 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--ink-subtle)', pointerEvents: 'none' }} />
          <input
            className="input"
            style={{ paddingLeft: 38 }}
            placeholder="Buscar por NIT, razón social, referencia o concepto"
            value={busquedaInput}
            onChange={(e) => { setBusquedaInput(e.target.value); setPage(1); }}
          />
        </div>
        <select className="select" style={{ width: 'auto', minWidth: 158 }} value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1); }}>
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
        </select>
      </div>

      {isError ? (
        <ErrorState mensaje="No se pudo cargar el maestro de facturación" />
      ) : isLoading ? (
        <Spinner label="Cargando…" />
      ) : lineas.length === 0 ? (
        <div className="card"><EmptyState titulo="Sin líneas" descripcion="No hay líneas que coincidan con la búsqueda." /></div>
      ) : (
        <>
          <div className="table-wrap" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 120ms' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Referencia</th>
                  <th>Cuenta contable</th>
                  <th className="right">Plazo</th>
                  <th>Cód. iFactura / SIIGO</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr
                    key={l.id}
                    className={puedeEditar ? 'clickable' : ''}
                    onClick={puedeEditar ? () => setModal({ linea: l }) : undefined}
                  >
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 500 }}>{l.cliente.razonSocial}</span>
                        <span className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-subtle)' }}>
                          {l.cliente.nit.startsWith('PEND-') ? 'NIT pendiente' : l.cliente.nit}
                        </span>
                      </div>
                    </td>
                    <td>{l.referencia ?? '—'}</td>
                    <td className="mono">{l.cuentaContable ?? '—'}</td>
                    <td className="right num">{l.plazoDias != null ? `${l.plazoDias} d` : '—'}</td>
                    <td className="mono muted">{[l.codIfactura, l.codSiigo].filter(Boolean).join(' / ') || '—'}</td>
                    <td><EstadoBadge estado={l.estado} /></td>
                  </tr>
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

      {modal && <LineaModal linea={modal.linea} onClose={() => setModal(null)} />}
    </div>
  );
}
