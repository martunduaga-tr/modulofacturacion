import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, GitMerge, Check } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { SugerenciaReconciliacion, Cliente } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { Spinner, ErrorState, EmptyState } from '../components/ui/Feedback';
import { ClientePicker } from '../components/form/ClientePicker';
import styles from './ReconciliacionPage.module.css';

export function ReconciliacionPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reconciliacion'],
    queryFn: () => api.get<SugerenciaReconciliacion[]>('/reconciliacion/sugerencias'),
  });

  const pendientes = data ?? [];

  return (
    <div>
      <PageHeader
        titulo="Reconciliación de clientes"
        subtitulo="Cruza los clientes con NIT pendiente (que tienen las tarifas) con su cliente real (que tiene los volúmenes)"
      />

      <div className={styles.info}>
        Al confirmar, se <strong>mueven las tarifas</strong> del cliente pendiente al real y se
        <strong> reenganchan los volúmenes</strong>. Revisa cada sugerencia: algunas son solo aproximadas.
      </div>

      {isError ? (
        <ErrorState mensaje="No se pudieron cargar las sugerencias" />
      ) : isLoading ? (
        <Spinner label="Cargando…" />
      ) : pendientes.length === 0 ? (
        <div className="card">
          <EmptyState titulo="Todo reconciliado" descripcion="No quedan clientes con NIT pendiente." />
        </div>
      ) : (
        <div className={styles.lista}>
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>{pendientes.length} clientes por reconciliar</span>
          {pendientes.map((s) => (
            <TarjetaReconciliacion key={s.pendiente.id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function TarjetaReconciliacion({ s }: { s: SugerenciaReconciliacion }) {
  const qc = useQueryClient();
  const [realId, setRealId] = useState<string>(s.candidatos[0]?.id ? String(s.candidatos[0].id) : '');
  const [manual, setManual] = useState(false);
  const [clienteManual, setClienteManual] = useState<Cliente | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const idElegido = manual ? clienteManual?.id : realId ? Number(realId) : undefined;

  const confirmar = useMutation({
    mutationFn: () =>
      api.post<{ contratosMovidos: number; volumenesEnlazados: number }>('/reconciliacion/confirmar', {
        pendClienteId: s.pendiente.id,
        realClienteId: idElegido,
      }),
    onSuccess: (r) => {
      setHecho(`Fusionado: ${r.contratosMovidos} contrato(s) movidos, ${r.volumenesEnlazados} volumen(es) enlazados.`);
      setTimeout(() => qc.invalidateQueries({ queryKey: ['reconciliacion'] }), 1200);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'No se pudo confirmar'),
  });

  if (hecho) {
    return (
      <div className={`card ${styles.tarjeta} ${styles.ok}`}>
        <Check size={18} /> <span>{s.pendiente.razonSocial}: {hecho}</span>
      </div>
    );
  }

  return (
    <div className={`card ${styles.tarjeta}`}>
      <div className={styles.pend}>
        <span className={styles.nombre}>{s.pendiente.razonSocial}</span>
        <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>{s.contratos} contrato(s) con tarifa</span>
      </div>

      <ArrowRight size={18} className={styles.flecha} />

      <div className={styles.real}>
        {manual ? (
          <ClientePicker seleccionado={clienteManual} onSeleccionar={setClienteManual} />
        ) : (
          <select className="select" value={realId} onChange={(e) => setRealId(e.target.value)}>
            <option value="">— Elegir cliente real —</option>
            {s.candidatos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.razonSocial} · {c.nit} ({Math.round(c.score * 100)}%)
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => { setManual((v) => !v); setError(null); }}>
          {manual ? 'Ver sugerencias' : 'Buscar otro'}
        </button>
      </div>

      <button
        className="btn btn-primary btn-sm"
        disabled={!idElegido || confirmar.isPending}
        onClick={() => { setError(null); confirmar.mutate(); }}
      >
        <GitMerge size={15} /> {confirmar.isPending ? 'Fusionando…' : 'Confirmar'}
      </button>

      {error && <div className={styles.err}>{error}</div>}
    </div>
  );
}
