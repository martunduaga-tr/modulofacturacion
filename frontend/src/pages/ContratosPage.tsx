import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import type { Contrato, PaginatedResult, Producto } from '../lib/types';
import { rangoVigencia } from '../lib/format';
import { useDebounce } from '../hooks/useDebounce';
import { EstadoBadge } from '../components/ui/Badges';
import { Spinner, EmptyState, ErrorState } from '../components/ui/Feedback';
import { PageHeader } from '../components/PageHeader';
import styles from './ContratosPage.module.css';

const LIMIT = 20;

export function ContratosPage() {
  const navigate = useNavigate();
  const [busquedaInput, setBusquedaInput] = useState('');
  const [productoId, setProductoId] = useState('');
  const [modeloCobro, setModeloCobro] = useState('');
  const [estado, setEstado] = useState('');
  const [page, setPage] = useState(1);
  const busqueda = useDebounce(busquedaInput);

  const { data: productos } = useQuery({
    queryKey: ['productos-filtro'],
    queryFn: () => api.get<PaginatedResult<Producto>>('/productos', { limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const filtros = { busqueda, productoId, modeloCobro, estado };
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['contratos', page, filtros],
    queryFn: () =>
      api.get<PaginatedResult<Contrato>>('/contratos', {
        page,
        limit: LIMIT,
        busqueda: busqueda || undefined,
        productoId: productoId || undefined,
        modeloCobro: modeloCobro || undefined,
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

  const contratos = data?.data ?? [];

  return (
    <div>
      <PageHeader
        titulo="Contratos"
        subtitulo={data ? `${data.total} contratos` : 'Cargando…'}
        acciones={
          <button className="btn btn-primary" onClick={() => navigate('/contratos/nuevo')}>
            <Plus size={18} /> Crear contrato
          </button>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Search size={16} />
          <input
            className="input"
            placeholder="Buscar por NIT, razón social o nombre del contrato"
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
            value={productoId}
            onChange={(e) => resetPage(setProductoId)(e.target.value)}
            aria-label="Filtrar por producto"
          >
            <option value="">Todos los productos</option>
            {productos?.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={modeloCobro}
            onChange={(e) => resetPage(setModeloCobro)(e.target.value)}
            aria-label="Filtrar por modelo de cobro"
          >
            <option value="">Todos los modelos</option>
            <option value="volumen_escalonado">Escalonado</option>
            <option value="minimo_garantizado">Mínimo garantizado</option>
            <option value="fijo_mensual">Fijo mensual</option>
            <option value="bolsa">Bolsa</option>
          </select>
          <select
            className="select"
            value={estado}
            onChange={(e) => resetPage(setEstado)(e.target.value)}
            aria-label="Filtrar por estado"
          >
            <option value="">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>
      </div>

      {isError ? (
        <ErrorState mensaje={error instanceof Error ? error.message : 'Error al cargar contratos'} />
      ) : isLoading ? (
        <Spinner label="Cargando contratos…" />
      ) : contratos.length === 0 ? (
        <div className="card">
          <EmptyState
            titulo="No hay contratos que coincidan"
            descripcion="Ajusta la búsqueda o los filtros, o crea un contrato nuevo."
          />
        </div>
      ) : (
        <>
          <div className="table-wrap" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 120ms' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contrato</th>
                  <th>Vigencia</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {contratos.map((c) => (
                  <tr
                    key={c.id}
                    className="clickable"
                    onClick={() => navigate(`/contratos/${c.id}`)}
                  >
                    <td>
                      <div className={styles.cliente}>
                        <span className={styles.clienteNombre}>{c.cliente.razonSocial}</span>
                        <span
                          className={`${styles.clienteNit} mono ${
                            c.cliente.nit.startsWith('PEND-') ? styles.placeholderNit : ''
                          }`}
                        >
                          {c.cliente.nit.startsWith('PEND-') ? 'NIT pendiente' : c.cliente.nit}
                        </span>
                      </div>
                    </td>
                    <td>{c.nombreContrato}</td>
                    <td className="muted">{rangoVigencia(c.vigenciaDesde, c.vigenciaHasta)}</td>
                    <td>
                      <EstadoBadge estado={c.estado} />
                    </td>
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
