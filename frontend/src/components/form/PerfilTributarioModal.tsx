import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { Cliente } from '../../lib/types';
import { textoSegmento } from '../../lib/format';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/ToastProvider';

/** Fracción → texto en % con coma ("0.035" → "3,5"); null → ''. */
const aPct = (v: number | null) => (v == null ? '' : String(Math.round(v * 1_000_000) / 10_000).replace('.', ','));

/** "3,5" o "3.5" → 0.035 exacto (sin residuos de punto flotante); '' → null; inválido → NaN. */
function aFraccion(texto: string): number | null {
  const t = texto.trim().replace('%', '').replace(',', '.');
  if (!t) return null;
  if (!/^\d+(\.\d{1,4})?$/.test(t)) return NaN;
  const [ent, dec = ''] = t.split('.');
  // Mover la coma 2 posiciones como texto: 0,966% -> 0.00966 sin pasar por una división en float.
  const digitos = (ent + dec.padEnd(4, '0')).replace(/^0+(?=\d)/, '');
  return Number(digitos) / 1_000_000;
}

const CAMPOS = [
  { k: 'tasaRtefte', label: 'Retención en la fuente', ej: '3,5' },
  { k: 'tasaRteiva', label: 'Retención de IVA (sobre el IVA)', ej: '15' },
  { k: 'tasaRteica', label: 'Retención de ICA', ej: '0,966' },
] as const;

export function PerfilTributarioModal({ cliente, onClose }: { cliente: Cliente; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tasas, setTasas] = useState({
    tasaRtefte: aPct(cliente.tasaRtefte),
    tasaRteiva: aPct(cliente.tasaRteiva),
    tasaRteica: aPct(cliente.tasaRteica),
  });

  const valores = Object.fromEntries(CAMPOS.map(({ k }) => [k, aFraccion(tasas[k])])) as Record<(typeof CAMPOS)[number]['k'], number | null>;
  const errores = CAMPOS.filter(({ k }) => valores[k] == null || Number.isNaN(valores[k]) || valores[k]! >= 1).map(({ k }) => k);

  const guardar = useMutation({
    mutationFn: () => api.patch<Cliente>(`/clientes/${cliente.id}/perfil-tributario`, valores),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente', String(cliente.id)] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      toast.exito('Retenciones actualizadas. Aplican a los próximos cálculos.');
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar'),
  });

  return (
    <Modal
      titulo="Retenciones del cliente"
      onClose={onClose}
      maxWidth={480}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={errores.length > 0 || guardar.isPending} onClick={() => guardar.mutate()}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 'var(--text-sm)' }}>
        {cliente.razonSocial} · NIT {cliente.nit} · {textoSegmento(cliente.segmento)}. Las tasas aplican a todos sus contratos
        (corporativos y Express) en los próximos cálculos; lo ya aprobado no cambia. Cada cambio queda en Auditoría.
      </p>
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {CAMPOS.map(({ k, label, ej }) => (
          <label className="field" key={k}>
            <span className="field-label">{label} (%)</span>
            <input
              className="input"
              inputMode="decimal"
              value={tasas[k]}
              placeholder={`Ej. ${ej} — 0 si no aplica`}
              onChange={(e) => setTasas((t) => ({ ...t, [k]: e.target.value }))}
              aria-invalid={tasas[k] !== '' && errores.includes(k)}
            />
            {tasas[k] !== '' && errores.includes(k) && <span className="field-error">Porcentaje válido con máximo 4 decimales, menor que 100.</span>}
          </label>
        ))}
      </div>
    </Modal>
  );
}
