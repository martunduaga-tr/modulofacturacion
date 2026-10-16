import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { ErrorState } from '../components/ui/Feedback';
import { BrandMark } from '../components/Brand';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const destino = (location.state as { from?: string })?.from ?? '/contratos';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await login(username.trim(), password);
      navigate(destino, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.brandPanel}>
        <div className={styles.glow} aria-hidden />
        <BrandMark size={110} />
        <div className={styles.brandCopy}>
          <p className={`${styles.overline} mono`}>Innovación &amp; IA</p>
          <h1 className={styles.headline}>Juntos creamos ecosistemas de negocio</h1>
          <p className={styles.tagline}>
            Consola de procesos automatizados. Un solo lenguaje visual para todo lo que
            construimos.
          </p>
        </div>
        <p className={styles.copyright}>© {new Date().getFullYear()} Transfiriendo · Bogotá</p>
      </div>

      <div className={styles.formPanel}>
        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.formHead}>
            <h2>Ingrese a su cuenta</h2>
            <p>Use su usuario y contraseña corporativos.</p>
          </div>

          {error && <ErrorState mensaje={error} />}

          <div className="field">
            <label className="field-label" htmlFor="username">
              Usuario
            </label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button className="btn btn-primary submit" type="submit" disabled={cargando}>
            {cargando ? 'Ingresando…' : 'Entrar'}
          </button>

          <p className={styles.help}>
            ¿Problemas para entrar? <a href="mailto:innovacion@transfiriendo.com">Escríbanos</a>
          </p>
        </form>
      </div>
    </div>
  );
}
