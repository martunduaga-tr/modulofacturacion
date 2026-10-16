import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { PaginatedResult, Producto } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { EstadoBadge } from '../components/ui/Badges';
import { Spinner, ErrorState } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/ToastProvider';

export function ProductosPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const esAdmin = user?.rol === 'administrador';
  const [creando, setCreando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['productos-admin'],
    queryFn: () => api.get<PaginatedResult<Producto>>('/productos', { limit: 100 }),
  });

  const crear = useMutation({
    mutationFn: () => api.post<Producto>('/productos', { codigo, nombre }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos-admin'] });
      toast.exito(`Producto "${nombre}" creado.`);
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

  if (isLoading) return <Spinner label="Cargando productos…" />;
  if (isError) return <ErrorState mensaje="No se pudieron cargar los productos" />;

  return (
    <div>
      <PageHeader
        titulo="Productos"
        subtitulo={`${data?.total ?? 0} productos del portafolio`}
        acciones={
          esAdmin && (
            <button className="btn btn-primary" onClick={() => setCreando(true)}>
              <Plus size={18} /> Crear producto
            </button>
          )
        }
      />

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
            {data?.data.map((p) => (
              <tr key={p.id} className="clickable" onClick={() => navigate(`/productos/${p.id}`)}>
                <td className="mono">{p.codigo}</td>
                <td style={{ fontWeight: 500 }}>{p.nombre}</td>
                <td>
                  <EstadoBadge estado={p.estado} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creando && (
        <Modal
          titulo="Crear producto"
          onClose={cerrar}
          footer={
            <>
              <button className="btn btn-ghost" onClick={cerrar}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => crear.mutate()}
                disabled={crear.isPending || !codigo.trim() || !nombre.trim()}
              >
                {crear.isPending ? 'Creando…' : 'Crear'}
              </button>
            </>
          }
        >
          {error && <ErrorState mensaje={error} />}
          <div className="field">
            <label className="field-label">Código</label>
            <input className="input" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ISEGUROS" autoFocus />
            <span className="field-hint">Se guarda en mayúsculas. Único.</span>
          </div>
          <div className="field">
            <label className="field-label">Nombre</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="iSeguros" />
          </div>
        </Modal>
      )}
    </div>
  );
}
