import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Rol, Usuario } from '../lib/types';
import { formatearFecha } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { EstadoBadge } from '../components/ui/Badges';
import { Spinner, ErrorState } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/ToastProvider';

const ROL_LABEL: Record<Rol, string> = {
  administrador: 'Administrador',
  editor: 'Editor',
  lector: 'Lector',
};

export function UsuariosPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState({ username: '', nombre: '', email: '', password: '', rol: 'lector' as Rol });
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => api.get<Usuario[]>('/usuarios'),
  });

  const crear = useMutation({
    mutationFn: () =>
      api.post('/usuarios', {
        username: form.username.trim(),
        nombre: form.nombre.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
        rol: form.rol,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      toast.exito(`Usuario "${form.username.trim()}" creado.`);
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
    setForm({ username: '', nombre: '', email: '', password: '', rol: 'lector' });
    setError(null);
  }

  const valido = form.username.trim() && form.nombre.trim() && form.password.length >= 8;

  if (isLoading) return <Spinner label="Cargando usuarios…" />;
  if (isError) return <ErrorState mensaje="No se pudieron cargar los usuarios" />;

  return (
    <div>
      <PageHeader
        titulo="Usuarios"
        subtitulo={`${data?.length ?? 0} usuarios`}
        acciones={
          <button className="btn btn-primary" onClick={() => setCreando(true)}>
            <Plus size={18} /> Crear usuario
          </button>
        }
      />

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Creado</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id}>
                <td className="mono" style={{ fontWeight: 500 }}>{u.username}</td>
                <td>{u.nombre}</td>
                <td className="muted">{u.email ?? '—'}</td>
                <td><span className="badge badge-plain badge-primary">{ROL_LABEL[u.rol]}</span></td>
                <td><EstadoBadge estado={u.estado} /></td>
                <td className="muted">{formatearFecha(u.fechaCreacion)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creando && (
        <Modal
          titulo="Crear usuario"
          onClose={cerrar}
          footer={
            <>
              <button className="btn btn-ghost" onClick={cerrar}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => crear.mutate()} disabled={crear.isPending || !valido}>
                {crear.isPending ? 'Creando…' : 'Crear'}
              </button>
            </>
          }
        >
          {error && <ErrorState mensaje={error} />}
          <div className="field">
            <label className="field-label">Usuario</label>
            <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus />
          </div>
          <div className="field">
            <label className="field-label">Nombre completo</label>
            <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">Correo (opcional)</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">Contraseña</label>
            <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <span className="field-hint">Mínimo 8 caracteres.</span>
          </div>
          <div className="field">
            <label className="field-label">Rol</label>
            <select className="select" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}>
              <option value="lector">Lector (solo consulta)</option>
              <option value="editor">Editor (Contabilidad)</option>
              <option value="administrador">Administrador</option>
            </select>
          </div>
        </Modal>
      )}
    </div>
  );
}
