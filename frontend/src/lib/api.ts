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

  // FormData (subida de archivos): el navegador pone el Content-Type con su boundary.
  const esArchivo = opts.body instanceof FormData;
  const headers: Record<string, string> = esArchivo ? {} : { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : esArchivo ? (opts.body as FormData) : JSON.stringify(opts.body),
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
      // Clave temporal: el backend solo deja cambiarla; la app lleva al usuario a hacerlo.
      if (res.status === 403 && data.code === 'DEBE_CAMBIAR_CLAVE') {
        window.dispatchEvent(new CustomEvent('coe:cambiar-clave'));
      }
    } catch {
      /* sin cuerpo JSON */
    }
    throw new ApiError(res.status, mensaje);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Pide un archivo generado por el servidor (POST con cuerpo) y lo guarda con ese nombre. */
export async function descargarArchivo(path: string, body: unknown, nombre: string): Promise<void> {
  const token = getToken();
  const res = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
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
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Descarga un archivo autenticado (ej. el PDF de soporte) y lo abre en una pestaña nueva. */
export async function abrirArchivo(path: string): Promise<void> {
  const token = getToken();
  const res = await fetch(BASE_URL + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, res.status === 404 ? 'La solicitud no tiene PDF adjunto.' : `Error ${res.status}`);
  const url = URL.createObjectURL(await res.blob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const api = {
  get: <T>(path: string, params?: RequestOptions['params']) => request<T>(path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  upload: <T>(path: string, form: FormData, method: 'POST' | 'PATCH' = 'POST') => request<T>(path, { method, body: form }),
};
