import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Modal } from './Modal';
import styles from './ConfirmDialog.module.css';

interface Props {
  titulo: string;
  /** Explica el impacto real de la acción — no un "¿estás seguro?" genérico. */
  mensaje: ReactNode;
  confirmarLabel?: string;
  cancelarLabel?: string;
  /** 'peligro' = acción que afecta datos ya facturados/tarifas vigentes; botón en rojo. */
  variante?: 'default' | 'peligro';
  confirmando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export function ConfirmDialog({
  titulo,
  mensaje,
  confirmarLabel = 'Confirmar',
  cancelarLabel = 'Cancelar',
  variante = 'default',
  confirmando = false,
  onConfirmar,
  onCancelar,
}: Props) {
  return (
    <Modal
      titulo={titulo}
      onClose={onCancelar}
      maxWidth={440}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancelar} disabled={confirmando}>
            {cancelarLabel}
          </button>
          <button
            className={`btn ${variante === 'peligro' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirmar}
            disabled={confirmando}
            autoFocus
          >
            {confirmando ? 'Aplicando…' : confirmarLabel}
          </button>
        </>
      }
    >
      <div className={styles.cuerpo}>
        {variante === 'peligro' && <TriangleAlert size={20} className={styles.icono} aria-hidden />}
        <div className={styles.mensaje}>{mensaje}</div>
      </div>
    </Modal>
  );
}
