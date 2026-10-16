const BASE_URL = (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:3000/api';
const TOKEN_KEY = 'coe.token';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | undefined | null>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(BASE_URL + path);
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) {
    setToken(null);
    if (!path.startsWith('/auth/login')) {
      window.dispatchEvent(new CustomEvent('coe:unauthorized'));
    }
  }

  if (!res.ok) {
    let mensaje = `Error ${res.status}`;
    try {
      const data = await res.json();
      mensaje = Array.isArray(data.message) ? data.message.join('; ') : data.message ?? mensaje;
    } catch {
      /* sin cuerpo JSON */
    }
    throw new ApiError(res.status, mensaje);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, params?: RequestOptions['params']) => request<T>(path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
};
