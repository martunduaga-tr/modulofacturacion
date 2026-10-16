import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import type { Cliente, PaginatedResult } from '../lib/types';
import { useDebounce } from '../hooks/useDebounce';
import { EstadoBadge } from '../components/ui/Badges';
import { Spinner, EmptyState, ErrorState } from '../components/ui/Feedback';
import { PageHeader } from '../components/PageHeader';
import styles from './ClientesPage.module.css';

const LIMIT = 20;

export function ClientesPage() {
  const navigate = useNavigate();
  const [busquedaInput, setBusquedaInput] = useState('');
  const [estado, setEstado] = useState('');
  const [page, setPage] = useState(1);
  const busqueda = useDebounce(busquedaInput);

  const filtros = { busqueda, estado };
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['clientes', page, filtros],
    queryFn: () =>
      api.get<PaginatedResult<Cliente>>('/clientes', {
        page,
        limit: LIMIT,
        busqueda: busqueda || undefined,
        estado: estado || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  const clientes = data?.data ?? [];

  return (
    <div>
      <PageHeader
        titulo="Clientes"
        subtitulo={data ? `${data.total} clientes` : 'Cargando…'}
      />

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Search size={16} />
          <input
            className="input"
            placeholder="Buscar por NIT o razón social"
            value={busquedaInput}
            onChange={(e) => {
              setBusquedaInput(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className={styles.filters}>
          <select
            className="select"
            value={estado}
            onChange={(e) => resetPage(setEstado)(e.target.value)}
            aria-label="Filtrar por estado"
          >
            <option value="">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="retirado">Retirado</option>
          </select>
        </div>
      </div>

      {isError ? (
        <ErrorState mensaje={error instanceof Error ? error.message : 'Error al cargar clientes'} />
      ) : isLoading ? (
        <Spinner label="Cargando clientes…" />
      ) : clientes.length === 0 ? (
        <div className="card">
          <EmptyState
            titulo="No hay clientes que coincidan"
            descripcion="Ajusta la búsqueda o los filtros."
          />
        </div>
      ) : (
        <>
          <div className="table-wrap" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 120ms' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th className="right">Contratos</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => navigate(`/clientes/${c.id}`)}>
                    <td>
                      <div className={styles.cliente}>
                        <span className={styles.clienteNombre}>{c.razonSocial}</span>
                        <span
                          className={`${styles.clienteNit} mono ${
                            c.nit.startsWith('PEND-') ? styles.placeholderNit : ''
                          }`}
                        >
                          {c.nit.startsWith('PEND-') ? 'NIT pendiente' : c.nit}
                        </span>
                      </div>
                    </td>
                    <td>
                      <EstadoBadge estado={c.estado} />
                    </td>
                    <td className="right num">{c.contratosCount ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <span>
              Página {data?.page} de {data?.totalPages}
            </span>
            <div className={styles.pagControls}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} /> Anterior
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={!data || page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
