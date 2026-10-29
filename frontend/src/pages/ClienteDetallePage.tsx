import { useMemo, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Pencil } from 'lucide-react';
import { api } from '../lib/api';
import type { Cliente } from '../lib/types';
import { rangoVigencia, textoRetenciones, textoSegmento } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import { PerfilTributarioModal } from '../components/form/PerfilTributarioModal';
import { GraficoTransacciones } from '../components/GraficoTransacciones';
import { ComentariosFactura } from '../components/ComentariosFactura';
import { EstadoBadge } from '../components/ui/Badges';
import { Spinner, ErrorState, EmptyState } from '../components/ui/Feedback';
import styles from './ClienteDetallePage.module.css';

export function ClienteDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeEditar = user?.rol === 'administrador' || user?.rol === 'editor';
  const [editandoPerfil, setEditandoPerfil] = useState(false);
  // Desde una alerta llega ?servicio=… para abrir la gráfica en ese servicio.
  const [params] = useSearchParams();

  const { data: cliente, isLoading, isError, error } = useQuery({
    queryKey: ['cliente', id],
    queryFn: () => api.get<Cliente>(`/clientes/${id}`),
    enabled: !!id,
  });

  const servicios = useMemo(() => {
    if (!cliente?.contratos) return [];
    const nombres = new Set<string>();
    for (const contrato of cliente.contratos) {
      for (const item of contrato.items ?? []) {
        for (const c of item.conceptos) {
          nombres.add(`${c.producto.nombre} · ${c.concepto.nombre}`);
        }
      }
    }
    return Array.from(nombres).sort();
  }, [cliente]);

  if (isLoading) return <Spinner label="Cargando cliente…" />;
  if (isError) return <ErrorState mensaje={error instanceof Error ? error.message : 'Error'} />;
  if (!cliente) return null;

  const nitPendiente = cliente.nit.startsWith('PEND-');
  const contratos = cliente.contratos ?? [];

  return (
    <div>
      <Link to="/clientes" className={styles.back}>
        <ArrowLeft size={16} /> Volver a clientes
      </Link>

      <div className={styles.head}>
        <div>
          <h1>{cliente.razonSocial}</h1>
          <div className={styles.headMeta}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>NIT</span>
              <span className={`${styles.metaValue} mono`}>
                {nitPendiente
                  ? 'Pendiente de confirmar'
                  : cliente.dv
                    ? `${cliente.nit}-${cliente.dv}`
                    : cliente.nit}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Estado</span>
              <EstadoBadge estado={cliente.estado} />
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Correo</span>
              <span className={styles.metaValue}>{cliente.correoContacto ?? '—'}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Contratos</span>
              <span className={styles.metaValue}>{contratos.length}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Segmento</span>
              <span className={styles.metaValue} title="Sale de sus contratos activos">{textoSegmento(cliente.segmento)}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Retenciones</span>
              <span className={styles.metaValue}>
                {textoRetenciones(cliente) ?? <span className="badge badge-warn">Pendientes de definir</span>}
                {puedeEditar && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditandoPerfil(true)} style={{ marginLeft: 'var(--space-2)' }}>
                    <Pencil size={14} /> Editar retenciones
                  </button>
                )}
              </span>
            </div>
          </div>
          {cliente.observaciones && (
            <p className={styles.observaciones}>{cliente.observaciones}</p>
          )}
        </div>
      </div>

      {editandoPerfil && <PerfilTributarioModal cliente={cliente} onClose={() => setEditandoPerfil(false)} />}

      <div className={styles.itemsHead} id="comportamiento">Comportamiento de transacciones</div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <GraficoTransacciones clienteId={cliente.id} servicioInicial={params.get('servicio') ?? undefined} />
      </div>

      <div className={styles.itemsHead}>Comentario en la línea de factura</div>
      <ComentariosFactura clienteId={cliente.id} puedeEditar={puedeEditar} />

      <div className={styles.itemsHead}>Servicios vinculados</div>
      {servicios.length === 0 ? (
        <p className="muted">Sin servicios (el cliente todavía no tiene contratos cargados).</p>
      ) : (
        <div className={styles.chips}>
          {servicios.map((s) => (
            <span key={s} className="badge badge-plain badge-primary">
              {s}
            </span>
          ))}
        </div>
      )}

      <div className={styles.itemsHead}>
        {contratos.length} {contratos.length === 1 ? 'contrato vinculado' : 'contratos vinculados'}
      </div>

      {contratos.length === 0 ? (
        <div className="card">
          <EmptyState
            titulo="Sin contratos vinculados"
            descripcion="Este cliente todavía no tiene contratos cargados en la plataforma."
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Segmento</th>
                <th>Vigencia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {contratos.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => navigate(`/contratos/${c.id}`)}>
                  <td>{c.nombreContrato}</td>
                  <td>{textoSegmento(c.segmento)}</td>
                  <td className="muted">{rangoVigencia(c.vigenciaDesde, c.vigenciaHasta)}</td>
                  <td>
                    <EstadoBadge estado={c.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
