import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { SolicitudExpress, SuscripcionExpress, TipoSolicitud } from '../../lib/types';
import { formatearMoneda, formatearNumero } from '../../lib/format';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/ToastProvider';

// Las suscripciones Express son de iFactura (ver dato_expres.xlsx). El backend valida contra el catálogo.
const SERVICIOS = [
  { codigo: 'iFactura-Emision', nombre: 'Emisión' },
  { codigo: 'iFactura-Recepcion', nombre: 'Recepción' },
  { codigo: 'iFactura-DocSoporte', nombre: 'Documento soporte' },
  { codigo: 'iFactura-Nomina', nombre: 'Nómina electrónica' },
];

const TITULO: Record<TipoSolicitud, string> = {
  NUEVO: 'Nuevo cliente Express',
  RENOVACION: 'Renovación de suscripción',
  COBRO_ADICIONAL: 'Cobro de adicionales',
};

/** "3,5" / "1.500,5" / "1500.5" → número; '' → null. */
function num(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : NaN;
}

const pct = (v: number | null | undefined) => (v == null ? '' : String(Math.round(v * 10000) / 100).replace('.', ','));

interface Props {
  tipo: TipoSolicitud;
  /** Suscripción existente (renovación / adicionales). */
  suscripcion?: SuscripcionExpress;
  /** Solicitud devuelta por Contabilidad que se está corrigiendo. */
  corrigiendo?: SolicitudExpress;
  onClose: () => void;
}

export function SolicitudExpressModal({ tipo, suscripcion, corrigiendo, onClose }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const base = corrigiendo;
  const excedente = suscripcion?.tope != null ? Math.max(0, suscripcion.consumoCiclo - suscripcion.tope) : 0;

  const [f, setF] = useState({
    nit: base?.nit ?? '',
    razonSocial: base?.razonSocial ?? '',
    servicio: base?.servicio ?? SERVICIOS[0].codigo,
    tope: base?.tope != null ? String(base.tope) : suscripcion?.tope != null ? String(suscripcion.tope) : '',
    valorAnual: base?.valorAnual != null ? String(base.valorAnual) : '',
    vigenciaDesde: base?.vigenciaDesde ?? '',
    rtefte: pct(base?.tasaRtefte),
    rteiva: pct(base?.tasaRteiva),
    rteica: pct(base?.tasaRteica),
    cantidadAdicional: base?.cantidadAdicional != null ? String(base.cantidadAdicional) : '',
    precioAdicional: base?.precioAdicional != null ? String(base.precioAdicional).replace('.', ',') : '',
    noRenueva: base?.noRenueva ?? false,
    observaciones: base?.observaciones ?? '',
  });
  const [archivo, setArchivo] = useState<File | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const conPlan = tipo !== 'COBRO_ADICIONAL';
  const pdfObligatorio = conPlan && !base?.adjuntoNombre;
  const cantidad = num(f.cantidadAdicional);
  const precio = num(f.precioAdicional);
  const valorAdicional = cantidad && precio ? cantidad * precio : null;

  const enviar = useMutation({
    mutationFn: () => {
      const form = new FormData();
      const poner = (k: string, v: string | number | null | boolean) => {
        if (v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))) form.append(k, String(v));
      };
      poner('tipo', tipo);
      if (suscripcion) poner('contratoId', suscripcion.contratoId);
      if (tipo === 'NUEVO') {
        poner('nit', f.nit.replace(/\D/g, ''));
        poner('razonSocial', f.razonSocial.trim());
        poner('servicio', f.servicio);
        for (const [k, v] of [['tasaRtefte', f.rtefte], ['tasaRteiva', f.rteiva], ['tasaRteica', f.rteica]] as const) {
          const n = num(v);
          poner(k, n == null ? null : n / 100);
        }
      }
      if (conPlan) {
        poner('tope', num(f.tope));
        poner('valorAnual', num(f.valorAnual));
        poner('vigenciaDesde', f.vigenciaDesde);
      }
      poner('cantidadAdicional', cantidad);
      poner('precioAdicional', precio);
      if (tipo === 'COBRO_ADICIONAL') poner('noRenueva', f.noRenueva);
      poner('observaciones', f.observaciones.trim());
      if (archivo) form.append('adjunto', archivo);
      return base
        ? api.upload<SolicitudExpress>(`/express/solicitudes/${base.id}`, form, 'PATCH')
        : api.upload<SolicitudExpress>('/express/solicitudes', form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['express'] });
      toast.exito(base ? 'Solicitud corregida y reenviada a Contabilidad.' : 'Solicitud enviada a Contabilidad para aprobación.');
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo enviar la solicitud'),
  });

  const listo = (!pdfObligatorio || archivo) && !enviar.isPending;

  return (
    <Modal
      titulo={base ? `Corregir: ${TITULO[tipo].toLowerCase()}` : TITULO[tipo]}
      onClose={onClose}
      maxWidth={620}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!listo} onClick={() => enviar.mutate()}>
            {enviar.isPending ? 'Enviando…' : base ? 'Reenviar a Contabilidad' : 'Enviar a Contabilidad'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {base?.comentarioRevision && (
          <div className="field-hint" style={{ background: 'var(--warn-weak)', color: 'var(--warn)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
            <strong>Contabilidad pidió corregir:</strong> {base.comentarioRevision}
          </div>
        )}

        {suscripcion ? (
          <div>
            <div style={{ fontWeight: 600 }}>{suscripcion.razonSocial}</div>
            <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              NIT {suscripcion.nit} · {suscripcion.servicio} · plan actual {formatearNumero(suscripcion.tope)} documentos por{' '}
              {formatearMoneda(suscripcion.valorAnual)}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
              Consumo del ciclo (BigQuery): <strong>{formatearNumero(suscripcion.consumoCiclo)}</strong>
              {suscripcion.tope != null && <> de {formatearNumero(suscripcion.tope)}</>}
              {excedente > 0 && (
                <>
                  {' '}· <span style={{ color: 'var(--warn)' }}>excede en {formatearNumero(excedente)}</span>{' '}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF((x) => ({ ...x, cantidadAdicional: String(excedente) }))}>
                    Usar como cantidad adicional
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-3)' }}>
            <label className="field">
              <span className="field-label">NIT</span>
              <input className="input" value={f.nit} onChange={set('nit')} placeholder="900894782" inputMode="numeric" disabled={!!base} />
            </label>
            <label className="field">
              <span className="field-label">Razón social</span>
              <input className="input" value={f.razonSocial} onChange={set('razonSocial')} disabled={!!base} />
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span className="field-label">Servicio</span>
              <select className="select" value={f.servicio} onChange={set('servicio')} disabled={!!base}>
                {SERVICIOS.map((s) => (
                  <option key={s.codigo} value={s.codigo}>{s.nombre} ({s.codigo})</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {conPlan && (
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
            <legend className="field-label" style={{ marginBottom: 'var(--space-2)' }}>
              {tipo === 'RENOVACION' ? 'Plan del nuevo ciclo' : 'Plan'}
            </legend>
            <label className="field">
              <span className="field-label">Tope de documentos</span>
              <input className="input" value={f.tope} onChange={set('tope')} inputMode="numeric" />
            </label>
            <label className="field">
              <span className="field-label">Valor anual (antes de IVA)</span>
              <input className="input" value={f.valorAnual} onChange={set('valorAnual')} inputMode="decimal" />
            </label>
            <label className="field">
              <span className="field-label">Inicio del ciclo</span>
              <input className="input" type="date" value={f.vigenciaDesde} onChange={set('vigenciaDesde')} />
              <span className="field-hint">
                {tipo === 'RENOVACION' && !f.vigenciaDesde ? 'Vacío: el día siguiente al fin del ciclo actual.' : 'El ciclo dura 365 días.'}
              </span>
            </label>
          </fieldset>
        )}

        {tipo === 'NUEVO' && (
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
            <legend className="field-label" style={{ marginBottom: 'var(--space-2)' }}>Retenciones que practica el cliente (%)</legend>
            {(['rtefte', 'rteiva', 'rteica'] as const).map((k) => (
              <label className="field" key={k}>
                <span className="field-label">{{ rtefte: 'RteFte', rteiva: 'RteIVA', rteica: 'RteICA' }[k]}</span>
                <input className="input" value={f[k]} onChange={set(k)} placeholder="0" inputMode="decimal" />
              </label>
            ))}
          </fieldset>
        )}

        {tipo !== 'NUEVO' && (
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', alignItems: 'end' }}>
            <legend className="field-label" style={{ marginBottom: 'var(--space-2)' }}>
              Adicionales {tipo === 'RENOVACION' ? 'del ciclo que termina (si los hubo)' : 'a cobrar'}
            </legend>
            <label className="field">
              <span className="field-label">Cantidad</span>
              <input className="input" value={f.cantidadAdicional} onChange={set('cantidadAdicional')} inputMode="numeric" />
            </label>
            <label className="field">
              <span className="field-label">Precio unitario</span>
              <input className="input" value={f.precioAdicional} onChange={set('precioAdicional')} inputMode="decimal" />
            </label>
            <div className="field">
              <span className="field-label">Valor (antes de IVA)</span>
              <div className="input" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-sunken)' }}>
                {valorAdicional != null && !Number.isNaN(valorAdicional) ? formatearMoneda(valorAdicional, 2) : '—'}
              </div>
            </div>
          </fieldset>
        )}

        {tipo === 'COBRO_ADICIONAL' && (
          <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', fontSize: 'var(--text-sm)' }}>
            <input type="checkbox" checked={f.noRenueva} onChange={(e) => setF((x) => ({ ...x, noRenueva: e.target.checked }))} />
            El cliente <strong>no renueva</strong>: al aprobar, la suscripción se da de baja.
          </label>
        )}

        <label className="field">
          <span className="field-label">
            Soporte PDF {conPlan ? '(obligatorio)' : '(opcional)'}
          </span>
          <input className="input" type="file" accept="application/pdf,.pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          {base?.adjuntoNombre && !archivo && <span className="field-hint">Se conserva el PDF actual: {base.adjuntoNombre}</span>}
        </label>

        <label className="field">
          <span className="field-label">Observaciones</span>
          <textarea className="input" rows={2} style={{ height: 'auto', paddingTop: 'var(--space-2)' }} value={f.observaciones} onChange={set('observaciones')} maxLength={1000} />
        </label>

        {pdfObligatorio && !archivo && (
          <span className="field-hint"><FileUp size={14} style={{ verticalAlign: 'middle' }} /> Adjunte el PDF para poder enviar.</span>
        )}
      </div>
    </Modal>
  );
}
