import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { ContratoItem } from '../../lib/types';
import { etiquetaModelo } from '../../lib/format';
import { validarItemTarifa, validarEscalones, type EscalonInput, type RecargoInput } from '../../lib/validacionTarifas';
import { Modal } from '../ui/Modal';
import { ErrorState } from '../ui/Feedback';
import { useToast } from '../ui/ToastProvider';
import styles from './EscalonEditor.module.css';

interface Fila {
  volumenDesde: string;
  volumenHasta: string;
  precioUnitario: string;
}

interface RecargoFila {
  concepto: string;
  valor: string;
}

interface Props {
  item: ContratoItem;
  contratoId: number;
  anioEditar?: number;
  onClose: () => void;
}

export function TarifaAnioModal({ item, contratoId, anioEditar, onClose }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const modo = anioEditar ? 'editar' : 'agregar';
  const modelo = item.modeloCobro;

  const aniosExistentes = new Set([
    ...item.escalones.map((e) => e.anio),
    ...item.minimos.map((m) => m.anio),
    ...item.tarifasFijas.map((f) => f.anio),
  ]);
  const sugerido = anioEditar ?? Math.max(2025, ...aniosExistentes) + (aniosExistentes.size ? 1 : 0);

  const [anio, setAnio] = useState<number>(sugerido || 2026);
  const [filas, setFilas] = useState<Fila[]>(() => {
    if (anioEditar) {
      const e = item.escalones
        .filter((x) => x.anio === anioEditar)
        .sort((a, b) => a.volumenDesde - b.volumenDesde)
        .map((x) => ({ volumenDesde: String(x.volumenDesde), volumenHasta: String(x.volumenHasta), precioUnitario: String(x.precioUnitario) }));
      return e.length ? e : [{ volumenDesde: '', volumenHasta: '', precioUnitario: '' }];
    }
    return [{ volumenDesde: '', volumenHasta: '', precioUnitario: '' }];
  });
  const [valorMinimo, setValorMinimo] = useState<string>(
    anioEditar ? String(item.minimos.find((m) => m.anio === anioEditar)?.valorMinimo ?? '') : '',
  );
  const [volumenTopeMinimo, setVolumenTopeMinimo] = useState<string>(
    anioEditar ? String(item.minimos.find((m) => m.anio === anioEditar)?.volumenTope ?? '') : '',
  );
  const [valorFijo, setValorFijo] = useState<string>(
    anioEditar ? String(item.tarifasFijas.find((f) => f.anio === anioEditar)?.valorFijo ?? '') : '',
  );
  const [recargos, setRecargos] = useState<RecargoFila[]>(() =>
    anioEditar
      ? item.recargos.filter((r) => r.anio === anioEditar).map((r) => ({ concepto: r.concepto, valor: String(r.valor) }))
      : [],
  );
  const [error, setError] = useState<string | null>(null);

  const numOr = (v: string): number | '' => (v === '' ? '' : Number(v));
  const escalonesInput: EscalonInput[] = filas.map((f) => ({
    volumenDesde: numOr(f.volumenDesde),
    volumenHasta: numOr(f.volumenHasta),
    precioUnitario: numOr(f.precioUnitario),
  }));
  const recargosInput: RecargoInput[] = recargos.map((r) => ({ concepto: r.concepto, valor: numOr(r.valor) }));
  const { filasMalas } = validarEscalones(escalonesInput);
  const errores = validarItemTarifa(modelo, escalonesInput, numOr(valorMinimo), numOr(volumenTopeMinimo), numOr(valorFijo), recargosInput);

  function setFila(i: number, campo: keyof Fila, valor: string) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, [campo]: valor } : f)));
  }

  function setRecargoFila(i: number, campo: keyof RecargoFila, valor: string) {
    setRecargos((prev) => prev.map((r, idx) => (idx === i ? { ...r, [campo]: valor } : r)));
  }

  const recargosBody = recargos.map((r) => ({ concepto: r.concepto.trim(), valor: Number(r.valor) }));

  const guardar = useMutation({
    mutationFn: async () => {
      const escalones = filas.map((f) => ({
        volumenDesde: Number(f.volumenDesde),
        volumenHasta: Number(f.volumenHasta),
        precioUnitario: Number(f.precioUnitario),
      }));

      if (modo === 'agregar') {
        const body: Record<string, unknown> = { anio };
        if (modelo === 'fijo_mensual') body.valorFijo = Number(valorFijo);
        else {
          body.escalones = escalones;
          if (modelo === 'minimo_garantizado') {
            body.valorMinimo = Number(valorMinimo);
            body.volumenTopeMinimo = Number(volumenTopeMinimo);
          }
        }
        if (recargosBody.length > 0) body.recargosFijos = recargosBody;
        await api.post(`/contrato-items/${item.id}/anio`, body);
        return;
      }

      // editar año existente
      if (modelo === 'fijo_mensual') {
        const fija = item.tarifasFijas.find((f) => f.anio === anio);
        if (fija) await api.patch(`/tarifa-fija/${fija.id}`, { valorFijo: Number(valorFijo) });
      } else {
        await api.post(`/contrato-items/${item.id}/escalones`, { anio, escalones });
        if (modelo === 'minimo_garantizado') {
          const min = item.minimos.find((m) => m.anio === anio);
          if (min) await api.patch(`/minimos/${min.id}`, { valorMinimo: Number(valorMinimo), volumenTope: Number(volumenTopeMinimo) });
        }
      }
      // Recargos: reemplaza siempre el conjunto del año (incluso vacío, para permitir quitar todos).
      await api.post(`/contrato-items/${item.id}/recargos`, { anio, recargos: recargosBody });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contrato', String(contratoId)] });
      toast.exito(modo === 'agregar' ? `Tarifa ${anio} agregada.` : `Tarifa ${anio} actualizada.`);
      onClose();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'No se pudo guardar';
      setError(msg);
      toast.error(msg);
    },
  });

  return (
    <Modal
      titulo={`${modo === 'agregar' ? 'Agregar año' : `Editar año ${anioEditar}`} · ${item.conceptos.map((c) => `${c.producto.nombre} ${c.concepto.nombre}`).join(' + ')}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setError(null);
              if (errores.length) {
                setError(errores[0]);
                return;
              }
              guardar.mutate();
            }}
            disabled={guardar.isPending}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      {error && <ErrorState mensaje={error} />}

      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-end' }}>
        <div className="field" style={{ maxWidth: 120 }}>
          <label className="field-label">Año</label>
          <input
            className="input"
            type="number"
            value={anio}
            disabled={modo === 'editar'}
            onChange={(e) => setAnio(Number(e.target.value))}
          />
        </div>
        <span className="badge badge-plain badge-primary" style={{ marginBottom: 8 }}>
          {etiquetaModelo(modelo)}
        </span>
      </div>

      {modelo === 'fijo_mensual' ? (
        <div className="field" style={{ maxWidth: 220 }}>
          <label className="field-label">Valor fijo mensual</label>
          <input className="input" type="number" step="0.01" value={valorFijo} onChange={(e) => setValorFijo(e.target.value)} />
        </div>
      ) : (
        <>
          {modelo === 'minimo_garantizado' && (
            <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
              <div className="field" style={{ maxWidth: 220 }}>
                <label className="field-label">Valor mínimo garantizado</label>
                <input className="input" type="number" step="0.01" value={valorMinimo} onChange={(e) => setValorMinimo(e.target.value)} />
              </div>
              <div className="field" style={{ maxWidth: 220 }}>
                <label className="field-label">Tope de la banda (volumen hasta el que cubre el mínimo)</label>
                <input className="input" type="number" value={volumenTopeMinimo} onChange={(e) => setVolumenTopeMinimo(e.target.value)} />
                <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                  Por debajo o igual a este volumen se cobra solo el mínimo. El excedente se cobra a la tarifa del escalón del volumen total.
                </span>
              </div>
            </div>
          )}
          <div className={styles.wrap}>
            <label className="field-label">
              {modelo === 'bolsa' ? 'Bandas (monto plano por banda, no se multiplica por volumen)' : 'Escalones'}
            </label>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th>{modelo === 'bolsa' ? 'Monto de la banda' : 'Precio unitario'}</th>
                  <th aria-label="acciones" />
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i} className={filasMalas.has(i) ? styles.rowBad : ''}>
                    <td><input type="number" className="input" value={f.volumenDesde} onChange={(e) => setFila(i, 'volumenDesde', e.target.value)} /></td>
                    <td><input type="number" className="input" value={f.volumenHasta} onChange={(e) => setFila(i, 'volumenHasta', e.target.value)} /></td>
                    <td><input type="number" step="0.01" className="input" value={f.precioUnitario} onChange={(e) => setFila(i, 'precioUnitario', e.target.value)} /></td>
                    <td className={styles.actions}>
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={filas.length === 1} onClick={() => setFilas((p) => p.filter((_, idx) => idx !== i))} aria-label="Eliminar">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFilas((p) => [...p, { volumenDesde: '', volumenHasta: '', precioUnitario: '' }])}>
              <Plus size={16} /> Agregar {modelo === 'bolsa' ? 'banda' : 'escalón'}
            </button>
          </div>
        </>
      )}

      <div className={styles.wrap}>
        <label className="field-label">Recargos fijos (opcional, se suman siempre — ej. mantenimiento)</label>
        {recargos.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Valor mensual</th>
                <th aria-label="acciones" />
              </tr>
            </thead>
            <tbody>
              {recargos.map((r, i) => (
                <tr key={i}>
                  <td><input type="text" className="input" placeholder="MANTENIMIENTO" value={r.concepto} onChange={(e) => setRecargoFila(i, 'concepto', e.target.value)} /></td>
                  <td><input type="number" step="0.01" className="input" value={r.valor} onChange={(e) => setRecargoFila(i, 'valor', e.target.value)} /></td>
                  <td className={styles.actions}>
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setRecargos((p) => p.filter((_, idx) => idx !== i))} aria-label="Eliminar recargo">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRecargos((p) => [...p, { concepto: '', valor: '' }])}>
          <Plus size={16} /> Agregar recargo
        </button>
      </div>

      {errores.length > 0 && (
        <ul className={styles.errores}>
          {errores.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
