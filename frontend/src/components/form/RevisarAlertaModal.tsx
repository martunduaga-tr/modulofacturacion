import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { Alerta } from '../../lib/types';
import { MOTIVOS_REVISION } from '../../lib/format';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/ToastProvider';

/** Motivos que obligan a dejar dicho qué se hizo. */
const CON_NOTA = new Set(['otro', 'ajuste_factura']);

/**
 * Contabilidad marca una alerta de variación como revisada. Deja de salir; si
 * en el mes en curso aparecen días nuevos fuera de lo normal, vuelve.
 */
export function RevisarAlertaModal({ alerta, onClose }: { alerta: Alerta; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [motivo, setMotivo] = useState(alerta.revision?.motivo ?? '');
  const [nota, setNota] = useState(alerta.revision?.nota ?? '');
  const faltaNota = CON_NOTA.has(motivo) && !nota.trim();

  const guardar = useMutation({
    mutationFn: () => api.post('/alertas/revision', { clave: alerta.clave, motivo, nota: nota.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alertas'] });
      toast.exito('Alerta revisada. Queda en Auditoría.');
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar la revisión'),
  });

  return (
    <Modal
      titulo="Marcar como revisada"
      onClose={onClose}
      maxWidth={520}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!motivo || faltaNota || guardar.isPending} onClick={() => guardar.mutate()}>
            {guardar.isPending ? 'Guardando…' : 'Guardar revisión'}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0, fontSize: 'var(--text-sm)' }}>
        <strong>{alerta.clienteNombre}</strong>
        <br />
        <span className="muted">{alerta.mensaje}</span>
      </p>
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <label className="field">
          <span className="field-label">Motivo</span>
          <select className="select" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="">Selecciona…</option>
            {Object.entries(MOTIVOS_REVISION).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Nota {CON_NOTA.has(motivo) ? '' : '(opcional)'}</span>
          <textarea
            className="input"
            style={{ height: 88, paddingTop: 'var(--space-2)', resize: 'vertical' }}
            maxLength={500}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder={motivo === 'ajuste_factura' ? 'Qué se ajustó y en qué factura' : 'Qué se encontró'}
          />
          {faltaNota && <span className="field-error">Con este motivo hay que explicar qué se hizo.</span>}
        </label>
      </div>
    </Modal>
  );
}
