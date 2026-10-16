import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CircleCheck, CircleX, Info, X } from 'lucide-react';
import styles from './Toast.module.css';

type ToastTipo = 'exito' | 'error' | 'info';

interface ToastItem {
  id: number;
  tipo: ToastTipo;
  mensaje: string;
  saliendo: boolean;
}

/** Monta oculto (ver Toast.module.css) y en el siguiente frame agrega
 *  `.visible` para que la transicion realmente se dispare — sin esto, React
 *  pinta el elemento ya en su estado final y no hay nada que animar. */
function ToastCard({ item, onCerrar }: { item: ToastItem; onCerrar: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const Icono = ICONO[item.tipo];
  const clase = [styles.toast, styles[item.tipo], item.saliendo ? styles.saliendo : visible ? styles.visible : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={clase} role="status">
      <Icono size={18} className={styles.icono} />
      <span className={styles.mensaje}>{item.mensaje}</span>
      <button className={styles.cerrar} onClick={onCerrar} aria-label="Cerrar notificación">
        <X size={14} />
      </button>
    </div>
  );
}

interface ToastContextValue {
  exito: (mensaje: string) => void;
  error: (mensaje: string) => void;
  info: (mensaje: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DURACION_MS = 4000;
const ICONO: Record<ToastTipo, typeof CircleCheck> = { exito: CircleCheck, error: CircleX, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const temporizadores = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const pausado = useRef(false);

  const quitar = useCallback((id: number) => {
    const t = temporizadores.current.get(id);
    if (t) clearTimeout(t);
    temporizadores.current.delete(id);
    // Anima la salida antes de desmontar (transition, no keyframe: interrumpible).
    setToasts((prev) => prev.map((x) => (x.id === id ? { ...x, saliendo: true } : x)));
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 200);
  }, []);

  const programar = useCallback(
    (id: number) => {
      const t = setTimeout(() => {
        if (pausado.current) return;
        quitar(id);
      }, DURACION_MS);
      temporizadores.current.set(id, t);
    },
    [quitar],
  );

  const mostrar = useCallback(
    (tipo: ToastTipo, mensaje: string) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, tipo, mensaje, saliendo: false }]);
      programar(id);
    },
    [programar],
  );

  // Al pasar el mouse por el stack se pausan todos los timers (Sonner-style):
  // nadie quiere que un toast desaparezca justo cuando lo estan leyendo.
  const onMouseEnter = useCallback(() => {
    pausado.current = true;
  }, []);
  const onMouseLeave = useCallback(() => {
    pausado.current = false;
    for (const [id, t] of temporizadores.current) {
      clearTimeout(t);
      programar(id);
    }
  }, [programar]);

  const value = useMemo<ToastContextValue>(
    () => ({
      exito: (m) => mostrar('exito', m),
      error: (m) => mostrar('error', m),
      info: (m) => mostrar('info', m),
    }),
    [mostrar],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          className={styles.viewport}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          aria-live="polite"
          aria-atomic="false"
        >
          {toasts.map((t) => (
            <ToastCard key={t.id} item={t} onCerrar={() => quitar(t.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}
