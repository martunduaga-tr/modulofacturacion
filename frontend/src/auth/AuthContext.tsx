import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setToken, getToken } from '../lib/api';
import type { AuthUser } from '../lib/types';

const USER_KEY = 'coe.user';

interface LoginResponse {
  accessToken: string;
  usuario: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
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
    window.addEventListener('coe:unauthorized', onUnauthorized);
    return () => window.removeEventListener('coe:unauthorized', onUnauthorized);
  }, []);

  const login = async (username: string, password: string) => {
    const res = await api.post<LoginResponse>('/auth/login', { username, password });
    setToken(res.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.usuario));
    setUser(res.usuario);
  };

  const value = useMemo(
    () => ({ user, isAuthenticated: !!user, login, logout }),
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
