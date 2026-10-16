import type { ReactNode } from 'react';

export function PageHeader({
  titulo,
  subtitulo,
  acciones,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-6)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <h1>{titulo}</h1>
        {subtitulo && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>{subtitulo}</span>}
      </div>
      {acciones}
    </div>
  );
}
