import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type LoginResponse } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { ErrorState } from '../components/ui/Feedback';
import { useToast } from '../components/ui/ToastProvider';
import styles from './LoginPage.module.css';

/**
 * Cambiar la propia clave. Con clave temporal (puesta por el administrador) es obligatorio
 * y la app no deja ir a ninguna otra pantalla hasta hacerlo.
 */
export function CambiarClavePage() {
  const { user, iniciarSesion, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const obligatorio = !!user?.debeCambiarClave;
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const problema =
    nueva && nueva.length < 8
      ? 'La clave nueva debe tener al menos 8 caracteres.'
      : confirmar && nueva !== confirmar
        ? 'Las dos claves nuevas no coinciden.'
        : null;
  const valido = actual && nueva.length >= 8 && nueva === confirmar;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setError(null);
    setGuardando(true);
    try {
      iniciarSesion(await api.post<LoginResponse>('/auth/cambiar-clave', { actual, nueva }));
      toast.exito('Clave cambiada.');
      navigate('/contratos', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar la clave');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className={styles.formPanel} style={{ minHeight: '100vh' }}>
      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.formHead}>
          <h2>{obligatorio ? 'Cree su clave' : 'Cambiar mi clave'}</h2>
          <p>
            {obligatorio
              ? 'Entró con una clave temporal. Antes de continuar, cree una clave que solo usted conozca.'
              : `Usuario ${user?.username ?? ''}.`}
          </p>
        </div>

        {error && <ErrorState mensaje={error} />}

        <div className="field">
          <label className="field-label" htmlFor="actual">
            {obligatorio ? 'Clave temporal' : 'Clave actual'}
          </label>
          <input id="actual" className="input" type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" autoFocus required />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="nueva">Clave nueva</label>
          <input id="nueva" className="input" type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" required />
          <span className="field-hint">Mínimo 8 caracteres.</span>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="confirmar">Repita la clave nueva</label>
          <input id="confirmar" className="input" type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" required />
          {problema && <span className="field-hint" style={{ color: 'var(--color-danger, #b42318)' }}>{problema}</span>}
        </div>

        <button className="btn btn-primary submit" type="submit" disabled={!valido || guardando}>
          {guardando ? 'Guardando…' : 'Guardar clave'}
        </button>

        <p className={styles.help}>
          {obligatorio ? (
            <button type="button" className="btn btn-ghost" onClick={logout}>Salir</button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Volver</button>
          )}
        </p>
      </form>
    </div>
  );
}
