import type { ModeloCobro } from '../../lib/types';
import { etiquetaModelo } from '../../lib/format';

export function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    activo: 'badge-ok',
    aprobado: 'badge-ok',
    inactivo: 'badge-neutral',
    retirado: 'badge-neutral',
    pendiente: 'badge-warn',
    anomalia: 'badge-warn',
    rechazado: 'badge-danger',
  };
  const cls = map[estado] ?? 'badge-neutral';
  const label = estado.charAt(0).toUpperCase() + estado.slice(1);
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function ModeloBadge({ modelo }: { modelo: ModeloCobro }) {
  return <span className="badge badge-plain badge-primary">{etiquetaModelo(modelo)}</span>;
}
