import type { ReactNode } from 'react';

export function Spinner({ label }: { label?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        color: 'var(--ink-muted)',
        padding: 'var(--space-8)',
        justifyContent: 'center',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          border: '2px solid var(--border-strong)',
          borderTopColor: 'var(--primary)',
          borderRadius: '50%',
          animation: 'spin 700ms linear infinite',
        }}
      />
      {label && <span style={{ fontSize: 'var(--text-sm)' }}>{label}</span>}
    </div>
  );
}

export function EmptyState({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 'var(--space-16) var(--space-6)',
        color: 'var(--ink-muted)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-3)',
      }}
    >
      <h3 style={{ color: 'var(--ink)' }}>{titulo}</h3>
      {descripcion && <p style={{ margin: 0 }}>{descripcion}</p>}
      {accion && <div style={{ marginTop: 'var(--space-2)' }}>{accion}</div>}
    </div>
  );
}

export function ErrorState({ mensaje }: { mensaje: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: 'var(--space-4)',
        background: 'var(--danger-weak)',
        color: 'var(--danger)',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--text-sm)',
      }}
    >
      {mensaje}
    </div>
  );
}
