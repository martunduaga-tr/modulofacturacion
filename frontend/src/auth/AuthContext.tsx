import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setToken, getToken } from '../lib/api';
import type { AuthUser } from '../lib/types';

const USER_KEY = 'coe.user';

export interface LoginResponse {
  accessToken: string;
  usuario: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  /** Guarda la sesión nueva que devuelve el cambio de clave. */
  iniciarSesion: (res: LoginResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function leerUsuario(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw || !getToken()) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(leerUsuario);

  const logout = () => {
    setToken(null);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  };

  useEffect(() => {
    const onUnauthorized = () => logout();
    // El administrador le restableció la clave mientras tenía la sesión abierta.
    const onCambiarClave = () =>
      setUser((u) => {
        if (!u) return u;
        const nuevo = { ...u, debeCambiarClave: true };
        localStorage.setItem(USER_KEY, JSON.stringify(nuevo));
        return nuevo;
      });
    window.addEventListener('coe:unauthorized', onUnauthorized);
    window.addEventListener('coe:cambiar-clave', onCambiarClave);
    return () => {
      window.removeEventListener('coe:unauthorized', onUnauthorized);
      window.removeEventListener('coe:cambiar-clave', onCambiarClave);
    };
  }, []);

  const iniciarSesion = (res: LoginResponse) => {
    setToken(res.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.usuario));
    setUser(res.usuario);
  };

  const login = async (username: string, password: string) => {
    iniciarSesion(await api.post<LoginResponse>('/auth/login', { username, password }));
  };

  const value = useMemo(
    () => ({ user, isAuthenticated: !!user, login, iniciarSesion, logout }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
