import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  ClipboardList,
  Calculator,
  ArrowLeftRight,
  CalendarClock,
  Package,
  SlidersHorizontal,
  History,
  Users,
  Building2,
  GitMerge,
  Bell,
  KeyRound,
  LogOut,
  Menu,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import type { ResumenAlertas } from '../lib/types';
import { Brand, BrandMark } from './Brand';
import styles from './AppShell.module.css';

interface NavDef {
  to: string;
  label: string;
  icon: typeof FileText;
  soloAdmin?: boolean;
}

const NAV: NavDef[] = [
  { to: '/alertas', label: 'Alertas', icon: Bell },
  { to: '/contratos', label: 'Contratos', icon: FileText },
  { to: '/clientes', label: 'Clientes', icon: Building2 },
  { to: '/facturacion', label: 'Facturación', icon: ClipboardList },
  { to: '/empalme', label: 'Empalme', icon: ArrowLeftRight },
  { to: '/express', label: 'Express', icon: CalendarClock },
  { to: '/pre-liquidado', label: 'Pre-liquidado', icon: Calculator },
  { to: '/productos', label: 'Productos', icon: Package },
  { to: '/parametros', label: 'Parámetros', icon: SlidersHorizontal },
  { to: '/reconciliacion', label: 'Reconciliación', icon: GitMerge, soloAdmin: true },
  { to: '/auditoria', label: 'Auditoría', icon: History, soloAdmin: true },
  { to: '/usuarios', label: 'Usuarios', icon: Users, soloAdmin: true },
];

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export function AppShell() {
  const { user, logout } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [colapsado, setColapsado] = useState(false);
  const esAdmin = user?.rol === 'administrador';

  const { data: alertas } = useQuery({
    queryKey: ['alertas-resumen'],
    queryFn: () => api.get<ResumenAlertas>('/alertas/resumen'),
    refetchInterval: 60_000,
  });

  return (
    <div className={`${styles.shell} ${colapsado ? styles.shellCollapsed : ''}`}>
      <aside
        className={`${styles.sidebar} ${abierto ? styles.sidebarOpen : ''} ${colapsado ? styles.sidebarCollapsed : ''}`}
      >
        <div className={styles.brand}>
          {colapsado ? <BrandMark size={32} /> : <Brand />}
        </div>
        <nav className={styles.nav} onClick={() => setAbierto(false)}>
          {!colapsado && <span className={styles.navSection}>Gestión</span>}
          {NAV.filter((n) => !n.soloAdmin).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={colapsado ? label : undefined}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <Icon /> {!colapsado && label}
              {to === '/alertas' && !!alertas?.total && (
                <span className={styles.navBadge}>{alertas.total}</span>
              )}
            </NavLink>
          ))}
          {esAdmin && (
            <>
              {!colapsado && <span className={styles.navSection}>Administración</span>}
              {NAV.filter((n) => n.soloAdmin).map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={colapsado ? label : undefined}
                  className={({ isActive }) =>
                    `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
                  }
                >
                  <Icon /> {!colapsado && label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <button
          type="button"
          className={styles.collapseToggle}
          onClick={() => setColapsado((v) => !v)}
          aria-expanded={!colapsado}
          aria-label={colapsado ? 'Expandir menú' : 'Colapsar menú'}
        >
          {colapsado ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button
            className={`btn btn-ghost btn-icon ${styles.menuBtn}`}
            onClick={() => setAbierto((v) => !v)}
            aria-label="Menú"
          >
            <Menu size={18} />
          </button>
          <p className={styles.greeting}>
            Hola, <strong>{user?.nombre.split(' ')[0]}</strong>
          </p>
          <div style={{ flex: 1 }} />
          <div className={styles.user}>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user?.nombre}</span>
              <span className={styles.userRol}>{user?.rol}</span>
            </div>
            <div className={styles.avatar} aria-hidden>
              {user ? iniciales(user.nombre) : '?'}
            </div>
            <Link to="/cambiar-clave" className="btn btn-ghost btn-icon" aria-label="Cambiar mi clave" title="Cambiar mi clave">
              <KeyRound size={18} />
            </Link>
            <button className="btn btn-ghost btn-icon" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
