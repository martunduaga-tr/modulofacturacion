import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Contrato, ContratoItem } from '../lib/types';
import { rangoVigencia, formatearNumero } from '../lib/format';
import { EstadoBadge, ModeloBadge } from '../components/ui/Badges';
import { Money } from '../components/ui/Money';
import { Spinner, ErrorState } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { TarifaAnioModal } from '../components/form/TarifaAnioModal';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/ui/ToastProvider';
import { Plus } from 'lucide-react';
import styles from './ContratoFichaPage.module.css';

export function ContratoFichaPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const puedeEditar = user?.rol === 'administrador' || user?.rol === 'editor';
  const [editando, setEditando] = useState(false);

  const { data: contrato, isLoading, isError, error } = useQuery({
    queryKey: ['contrato', id],
    queryFn: () => api.get<Contrato>(`/contratos/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <Spinner label="Cargando contrato…" />;
  if (isError) return <ErrorState mensaje={error instanceof Error ? error.message : 'Error'} />;
  if (!contrato) return null;

  const { cliente } = contrato;
  const nitPendiente = cliente.nit.startsWith('PEND-');

  return (
    <div>
      <Link to="/contratos" className={styles.back}>
        <ArrowLeft size={16} /> Volver a contratos
      </Link>

      <div className={styles.head}>
        <div>
          <h1>
            <Link to={`/clientes/${cliente.id}`} className={styles.clienteLink}>
              {cliente.razonSocial}
            </Link>
          </h1>
          <div className={styles.headMeta}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>NIT</span>
              <span className={`${styles.metaValue} mono`}>
                {nitPendiente
                  ? 'Pendiente de confirmar'
                  : cliente.dv
                    ? `${cliente.nit}-${cliente.dv}`
                    : cliente.nit}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Contrato</span>
              <span className={styles.metaValue}>{contrato.nombreContrato}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Vigencia</span>
              <span className={styles.metaValue}>
                {rangoVigencia(contrato.vigenciaDesde, contrato.vigenciaHasta)}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Correo</span>
              <span className={styles.metaValue}>{cliente.correoContacto ?? '—'}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Estado</span>
              <EstadoBadge estado={contrato.estado} />
            </div>
          </div>
        </div>
        {puedeEditar && (
          <button className="btn btn-secondary" onClick={() => setEditando(true)}>
            <Pencil size={16} /> Editar
          </button>
        )}
      </div>

      <div className={styles.itemsHead}>
        {contrato.items?.length ?? 0} {contrato.items?.length === 1 ? 'item' : 'items'} facturable(s)
      </div>

      {contrato.items?.map((item) => (
        <ItemCard key={item.id} item={item} contratoId={contrato.id} puedeEditar={puedeEditar} />
      ))}

      {editando && <EditarCabecera contrato={contrato} onClose={() => setEditando(false)} />}
    </div>
  );
}

function EditarCabecera({ contrato, onClose }: { contrato: Contrato; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [nombre, setNombre] = useState(contrato.nombreContrato);
  const [desde, setDesde] = useState(contrato.vigenciaDesde ?? '');
  const [hasta, setHasta] = useState(contrato.vigenciaHasta ?? '');
  const [estado, setEstado] = useState(contrato.estado);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  // Dar de baja es reversible en la BD, pero no en efecto: mientras este
  // inactivo, el contrato no se liquida ni aparece en calculo/alertas.
  const dandoDeBaja = estado === 'inactivo' && contrato.estado === 'activo';

  const guardar = useMutation({
    mutationFn: () =>
      api.patch(`/contratos/${contrato.id}`, {
        nombreContrato: nombre.trim(),
        vigenciaDesde: desde || undefined,
        vigenciaHasta: hasta || undefined,
        estado,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contrato', String(contrato.id)] });
      qc.invalidateQueries({ queryKey: ['contratos'] });
      toast.exito(dandoDeBaja ? 'Contrato dado de baja.' : 'Contrato actualizado.');
      onClose();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'No se pudo guardar';
      setError(msg);
      setConfirmando(false);
      toast.error(msg);
    },
  });

  function onGuardarClick() {
    if (dandoDeBaja) setConfirmando(true);
    else guardar.mutate();
  }

  if (confirmando) {
    return (
      <ConfirmDialog
        titulo="Dar de baja este contrato"
        variante="peligro"
        confirmando={guardar.isPending}
        confirmarLabel="Sí, dar de baja"
        onCancelar={() => setConfirmando(false)}
        onConfirmar={() => guardar.mutate()}
        mensaje={
          <>
            <strong>{contrato.cliente.razonSocial}</strong> dejará de aparecer en cálculo de
            pre-liquidado y en Alertas mientras esté inactivo. Es reversible (puedes volver a
            marcarlo Activo), pero cualquier volumen que llegue mientras tanto no se liquidará.
          </>
        }
      />
    );
  }

  return (
    <Modal
      titulo="Editar contrato"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onGuardarClick} disabled={guardar.isPending || !nombre.trim()}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      {error && <ErrorState mensaje={error} />}
      <div className="field">
        <label className="field-label">Nombre del contrato</label>
        <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <div className="field">
          <label className="field-label">Vigencia desde</label>
          <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Vigencia hasta</label>
          <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label className="field-label">Estado</label>
        <select className="select" value={estado} onChange={(e) => setEstado(e.target.value as 'activo' | 'inactivo')}>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo (baja lógica)</option>
        </select>
      </div>
    </Modal>
  );
}

function ItemCard({ item, contratoId, puedeEditar }: { item: ContratoItem; contratoId: number; puedeEditar: boolean }) {
  const anios = useMemo(() => {
    const set = new Set<number>();
    item.escalones.forEach((e) => set.add(e.anio));
    item.minimos.forEach((m) => set.add(m.anio));
    item.tarifasFijas.forEach((f) => set.add(f.anio));
    item.recargos.forEach((r) => set.add(r.anio));
    return Array.from(set).sort((a, b) => b - a);
  }, [item]);

  const [anio, setAnio] = useState<number>(anios[0]);
  const [modal, setModal] = useState<{ anioEditar?: number } | null>(null);

  const escalones = item.escalones
    .filter((e) => e.anio === anio)
    .sort((a, b) => a.volumenDesde - b.volumenDesde);
  const minimo = item.minimos.find((m) => m.anio === anio);
  const fija = item.tarifasFijas.find((f) => f.anio === anio);
  const recargos = item.recargos.filter((r) => r.anio === anio);

  return (
    <div className={`card ${styles.item}`}>
      <div className={styles.itemHead}>
        <span className={styles.itemTitle}>
          {item.conceptos.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ' + '}
              {c.producto.nombre} <span className={styles.itemConcepto}>· {c.concepto.nombre}</span>
            </span>
          ))}
        </span>
        <ModeloBadge modelo={item.modeloCobro} />
        <div className={styles.spacer} />
        {anios.length > 0 && (
          <div className={styles.yearRow}>
            <label className={styles.yearLabel} htmlFor={`anio-${item.id}`}>
              Año
            </label>
            <select
              id={`anio-${item.id}`}
              className="select yearSelect"
              style={{ width: 'auto', height: 32 }}
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
            >
              {anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        )}
        {puedeEditar && (
          <div className={styles.itemActions}>
            <button className="btn btn-ghost btn-sm" onClick={() => setModal({ anioEditar: anio })} disabled={anios.length === 0}>
              <Pencil size={15} /> Editar año
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setModal({})}>
              <Plus size={15} /> Agregar año
            </button>
          </div>
        )}
      </div>

      {item.modeloCobro === 'minimo_garantizado' && minimo && (
        <div className={styles.minimo}>
          <span className={styles.minimoLabel}>Mínimo garantizado {anio} (hasta {formatearNumero(minimo.volumenTope)} unidades):</span>
          <span className={styles.minimoValue}>
            <Money valor={minimo.valorMinimo} />
          </span>
        </div>
      )}

      {item.modeloCobro === 'fijo_mensual' ? (
        <div className={styles.fijo}>
          <Money valor={fija?.valorFijo} /> <span className="muted" style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>/ mes</span>
        </div>
      ) : escalones.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Desde</th>
                <th>Hasta</th>
                <th className="right">{item.modeloCobro === 'bolsa' ? 'Monto de la banda' : 'Precio unitario'}</th>
              </tr>
            </thead>
            <tbody>
              {escalones.map((e) => (
                <tr key={e.id}>
                  <td className="num">{formatearNumero(e.volumenDesde)}</td>
                  <td className="num">{formatearNumero(e.volumenHasta)}</td>
                  <td className="right">
                    <Money valor={e.precioUnitario} decimales={2} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Sin tarifas para {anio}.</p>
      )}

      {recargos.length > 0 && (
        <div className={styles.minimo}>
          {recargos.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <span className={styles.minimoLabel}>Recargo fijo — {r.concepto}:</span>
              <span className={styles.minimoValue}>
                <Money valor={r.valor} /> <span className="muted" style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>/ mes</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <TarifaAnioModal
          item={item}
          contratoId={contratoId}
          anioEditar={modal.anioEditar}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
