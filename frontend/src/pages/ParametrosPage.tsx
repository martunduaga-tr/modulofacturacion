import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, TriangleAlert } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { ParametroGlobal } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/ui/ToastProvider';
import { formatearNumero, formatearFecha, formatearPorcentaje } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { Spinner, ErrorState } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import styles from './ParametrosPage.module.css';

function mostrarValor(p: ParametroGlobal): string {
  return p.clave === 'TRM' ? formatearNumero(p.valor) : formatearPorcentaje(p.valor);
}

export function ParametrosPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const esAdmin = user?.rol === 'administrador';
  const [editando, setEditando] = useState<ParametroGlobal | null>(null);
  const [valor, setValor] = useState('');
  const [vigencia, setVigencia] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['parametros'],
    queryFn: () => api.get<ParametroGlobal[]>('/parametros'),
  });

  const guardar = useMutation({
    mutationFn: () =>
      api.patch(`/parametros/${editando!.clave}`, {
        valor: Number(valor),
        vigenciaDesde: vigencia || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parametros'] });
      toast.exito(`${editando!.clave} actualizado — aplica a todo cálculo futuro.`);
      cerrar();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'No se pudo guardar';
      setError(msg);
      setConfirmando(false);
      toast.error(msg);
    },
  });

  function abrir(p: ParametroGlobal) {
    setEditando(p);
    setValor(String(p.valor));
    setVigencia('');
    setError(null);
  }
  function cerrar() {
    setEditando(null);
    setConfirmando(false);
    setError(null);
  }

  if (isLoading) return <Spinner label="Cargando parámetros…" />;
  if (isError) return <ErrorState mensaje="No se pudieron cargar los parámetros" />;

  return (
    <div>
      <PageHeader titulo="Parámetros globales" subtitulo="Tasas tributarias e índices vigentes" />

      <div className={styles.aviso}>
        <TriangleAlert size={16} />
        <span>
          Estos valores alimentan el cálculo de <strong>toda la facturación futura</strong> —no
          solo la del cliente que estés viendo—. Un cambio aquí no toca lo ya calculado, pero sí
          todo lo que se calcule después.
        </span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Clave</th>
              <th>Descripción</th>
              <th className="right">Valor</th>
              <th>Vigente desde</th>
              {esAdmin && <th aria-label="acciones" />}
            </tr>
          </thead>
          <tbody>
            {data?.map((p) => (
              <tr key={p.id}>
                <td className="mono" style={{ fontWeight: 500 }}>{p.clave}</td>
                <td className="muted">{p.descripcion ?? '—'}</td>
                <td className="right" style={{ fontWeight: 500 }}>{mostrarValor(p)}</td>
                <td className="muted">{formatearFecha(p.vigenciaDesde)}</td>
                {esAdmin && (
                  <td className="right">
                    <button className="btn btn-ghost btn-sm" onClick={() => abrir(p)}>
                      <Pencil size={15} /> Editar
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && !confirmando && (
        <Modal
          titulo={`Editar ${editando.clave}`}
          onClose={cerrar}
          footer={
            <>
              <button className="btn btn-ghost" onClick={cerrar}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => setConfirmando(true)} disabled={valor === ''}>
                Guardar
              </button>
            </>
          }
        >
          {error && <ErrorState mensaje={error} />}
          <div className="field">
            <label className="field-label">Valor</label>
            <input className="input" type="number" step="any" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
            <span className="field-hint">
              {editando.clave === 'TRM'
                ? 'Valor de la TRM (ej. 3651.9).'
                : 'Como fracción: 0.19 = 19%. Actual: ' + mostrarValor(editando)}
            </span>
          </div>
          <div className="field">
            <label className="field-label">Vigente desde (opcional)</label>
            <input className="input" type="date" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
            <span className="field-hint">Si lo cambias, se crea una nueva versión; si no, se usa hoy.</span>
          </div>
        </Modal>
      )}

      {editando && confirmando && (
        <ConfirmDialog
          titulo={`Confirmar cambio de ${editando.clave}`}
          variante="peligro"
          confirmando={guardar.isPending}
          confirmarLabel="Sí, aplicar cambio"
          onCancelar={() => setConfirmando(false)}
          onConfirmar={() => guardar.mutate()}
          mensaje={
            <>
              Vas a cambiar <strong>{editando.clave}</strong> de <strong>{mostrarValor(editando)}</strong> a{' '}
              <strong>{editando.clave === 'TRM' ? formatearNumero(Number(valor)) : formatearPorcentaje(Number(valor))}</strong>.
              Esto afecta el cálculo de <strong>todas las facturas futuras</strong> que usen esta tasa, no solo las nuevas — no se puede deshacer con "Cancelar" una vez guardado.
            </>
          }
        />
      )}
    </div>
  );
}
