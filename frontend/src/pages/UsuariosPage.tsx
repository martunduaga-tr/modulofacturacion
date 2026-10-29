import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, UserCheck, UserX } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Rol, Usuario } from '../lib/types';
import { formatearFecha } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { EstadoBadge } from '../components/ui/Badges';
import { Spinner, ErrorState } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/ToastProvider';

const ROL_LABEL: Record<Rol, string> = {
  administrador: 'Administrador',
  editor: 'Editor',
  lector: 'Lector',
  comercial: 'Comercial',
};

export function UsuariosPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState({ username: '', nombre: '', email: '', password: '', rol: 'lector' as Rol });
  const [error, setError] = useState<string | null>(null);
  const [restableciendo, setRestableciendo] = useState<Usuario | null>(null);
  const [temporal, setTemporal] = useState('');
  const [cambiandoEstado, setCambiandoEstado] = useState<Usuario | null>(null);

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
      toast.exito(`Usuario "${form.username.trim()}" creado. Entréguele la clave temporal: la cambiará al entrar.`);
      cerrar();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'No se pudo crear';
      setError(msg);
      toast.error(msg);
    },
  });

  const restablecer = useMutation({
    mutationFn: (u: Usuario) => api.patch(`/usuarios/${u.id}/restablecer-clave`, { password: temporal }),
    onSuccess: (_r, u) => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      toast.exito(`Clave temporal asignada a "${u.username}". La cambiará al entrar.`);
      setRestableciendo(null);
      setTemporal('');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo restablecer la clave'),
  });

  const estado = useMutation({
    mutationFn: (u: Usuario) => api.patch(`/usuarios/${u.id}/estado`, { estado: u.estado === 'activo' ? 'inactivo' : 'activo' }),
    onSuccess: (_r, u) => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      toast.exito(u.estado === 'activo' ? `"${u.username}" ya no puede entrar a la app.` : `"${u.username}" puede volver a entrar.`);
      setCambiandoEstado(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado'),
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
              <th aria-label="acciones" />
            </tr>
          </thead>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id}>
                <td className="mono" style={{ fontWeight: 500 }}>{u.username}</td>
                <td>{u.nombre}</td>
                <td className="muted">{u.email ?? '—'}</td>
                <td><span className="badge badge-plain badge-primary">{ROL_LABEL[u.rol]}</span></td>
                <td>
                  <EstadoBadge estado={u.estado} />
                  {u.debeCambiarClave && u.estado === 'activo' && (
                    <span className="badge badge-plain badge-accent" style={{ marginLeft: 6 }} title="Aún no ha cambiado la clave temporal">
                      Clave temporal
                    </span>
                  )}
                </td>
                <td className="muted">{formatearFecha(u.fechaCreacion)}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <button className="btn btn-ghost btn-icon" title="Asignar clave temporal" aria-label={`Asignar clave temporal a ${u.username}`} onClick={() => setRestableciendo(u)}>
                    <KeyRound size={16} />
                  </button>
                  {u.username !== user?.username && (
                    <button
                      className="btn btn-ghost btn-icon"
                      title={u.estado === 'activo' ? 'Desactivar' : 'Reactivar'}
                      aria-label={`${u.estado === 'activo' ? 'Desactivar' : 'Reactivar'} a ${u.username}`}
                      onClick={() => setCambiandoEstado(u)}
                    >
                      {u.estado === 'activo' ? <UserX size={16} /> : <UserCheck size={16} />}
                    </button>
                  )}
                </td>
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
            <label className="field-label">Clave temporal</label>
            <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <span className="field-hint">Mínimo 8 caracteres. El usuario la cambia la primera vez que entra.</span>
          </div>
          <div className="field">
            <label className="field-label">Rol</label>
            <select className="select" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}>
              <option value="lector">Lector (solo consulta)</option>
              <option value="editor">Editor (Contabilidad)</option>
              <option value="comercial">Comercial (solicitudes Express)</option>
              <option value="administrador">Administrador</option>
            </select>
          </div>
        </Modal>
      )}

      {restableciendo && (
        <Modal
          titulo={`Clave temporal para ${restableciendo.username}`}
          onClose={() => { setRestableciendo(null); setTemporal(''); }}
          maxWidth={460}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => { setRestableciendo(null); setTemporal(''); }}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => restablecer.mutate(restableciendo)} disabled={restablecer.isPending || temporal.length < 8}>
                {restablecer.isPending ? 'Guardando…' : 'Asignar'}
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>Su clave actual deja de servir. Al entrar con la temporal, la app le pedirá crear una nueva.</p>
          <div className="field">
            <label className="field-label">Clave temporal</label>
            <input className="input" type="password" value={temporal} onChange={(e) => setTemporal(e.target.value)} autoFocus />
            <span className="field-hint">Mínimo 8 caracteres.</span>
          </div>
        </Modal>
      )}

      {cambiandoEstado && (
        <ConfirmDialog
          titulo={cambiandoEstado.estado === 'activo' ? `Desactivar a ${cambiandoEstado.username}` : `Reactivar a ${cambiandoEstado.username}`}
          mensaje={
            cambiandoEstado.estado === 'activo'
              ? 'No podrá volver a entrar y su sesión abierta se cierra. Su historial en auditoría se conserva.'
              : 'Podrá volver a entrar con su clave actual.'
          }
          confirmarLabel={cambiandoEstado.estado === 'activo' ? 'Desactivar' : 'Reactivar'}
          variante={cambiandoEstado.estado === 'activo' ? 'peligro' : 'default'}
          confirmando={estado.isPending}
          onConfirmar={() => estado.mutate(cambiandoEstado)}
          onCancelar={() => setCambiandoEstado(null)}
        />
      )}
    </div>
  );
}
