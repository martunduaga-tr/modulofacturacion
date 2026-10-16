import isotipo from '../assets/brand/isotipo.png';

/* Marca oficial del Manual de Marca Transfiriendo 2024 — nunca se redibuja,
   se usa el asset provisto (isotipo). */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <img
      src={isotipo}
      alt=""
      aria-hidden
      style={{ width: size, height: size, flexShrink: 0, objectFit: 'contain' }}
    />
  );
}

export function Brand({ size = 36 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <BrandMark size={size} />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span style={{ fontFamily: 'var(--font-brand)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--sidebar-text-active)' }}>
          Facturación COE
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--sidebar-text)' }}>
          Transfiriendo S.A.
        </span>
      </span>
    </div>
  );
}
