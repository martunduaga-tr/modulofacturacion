import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { ConceptoFacturable, Producto } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { EstadoBadge } from '../components/ui/Badges';
import { Spinner, ErrorState, EmptyState } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/ToastProvider';
import { PageHeader } from '../components/PageHeader';

export function ProductoDetallePage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const esAdmin = user?.rol === 'administrador';
  const [creando, setCreando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: producto, isLoading, isError } = useQuery({
    queryKey: ['producto', id],
    queryFn: () => api.get<Producto & { conceptos: ConceptoFacturable[] }>(`/productos/${id}`),
    enabled: !!id,
  });

  const crear = useMutation({
    mutationFn: () => api.post(`/productos/${id}/conceptos`, { codigo, nombre }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['producto', id] });
      toast.exito(`Concepto "${nombre}" agregado.`);
      cerrar();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'No se pudo crear';
      setError(msg);
      toast.error(msg);
    },
  });

  function cerrar() {
    setCreando(false);
    setCodigo('');
    setNombre('');
    setError(null);
  }

  if (isLoading) return <Spinner label="Cargando…" />;
  if (isError || !producto) return <ErrorState mensaje="No se pudo cargar el producto" />;

  return (
    <div>
      <Link to="/productos" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', marginBottom: 'var(--space-4)' }}>
        <ArrowLeft size={16} /> Volver a productos
      </Link>

      <PageHeader
        titulo={producto.nombre}
        subtitulo={<span className="mono">{producto.codigo}</span>}
        acciones={
          esAdmin && (
            <button className="btn btn-primary" onClick={() => setCreando(true)}>
              <Plus size={18} /> Agregar concepto
            </button>
          )
        }
      />

      <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>Conceptos facturables</h2>

      {producto.conceptos.length === 0 ? (
        <div className="card">
          <EmptyState titulo="Sin conceptos" descripcion="Agrega los conceptos facturables de este producto (ej. emisión, recepción)." />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {producto.conceptos.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.codigo}</td>
                  <td style={{ fontWeight: 500 }}>{c.nombre}</td>
                  <td>
                    <EstadoBadge estado={c.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creando && (
        <Modal
          titulo="Agregar concepto"
          onClose={cerrar}
          footer={
            <>
              <button className="btn btn-ghost" onClick={cerrar}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => crear.mutate()} disabled={crear.isPending || !codigo.trim() || !nombre.trim()}>
                {crear.isPending ? 'Agregando…' : 'Agregar'}
              </button>
            </>
          }
        >
          {error && <ErrorState mensaje={error} />}
          <div className="field">
            <label className="field-label">Código</label>
            <input className="input" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="EMISION" autoFocus />
          </div>
          <div className="field">
            <label className="field-label">Nombre</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Emisión" />
          </div>
        </Modal>
      )}
    </div>
  );
}
