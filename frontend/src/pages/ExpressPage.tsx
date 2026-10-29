import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, FileText, Plus, RotateCcw, Undo2 } from 'lucide-react';
import { abrirArchivo, api, ApiError } from '../lib/api';
import type { CobroExpress, EstadoSolicitud, SolicitudExpress, SuscripcionExpress, TipoSolicitud } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { formatearFecha, formatearMoneda, formatearNumero } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { Money } from '../components/ui/Money';
import { Spinner, ErrorState, EmptyState } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/ToastProvider';
import { SolicitudExpressModal } from '../components/form/SolicitudExpressModal';
import styles from './ExpressPage.module.css';

const TIPO: Record<TipoSolicitud, string> = { NUEVO: 'Cliente nuevo', RENOVACION: 'Renovación', COBRO_ADICIONAL: 'Cobro de adicionales' };
const ESTADO: Record<EstadoSolicitud, { label: string; cls: string }> = {
  enviada: { label: 'Por revisar', cls: 'badge-primary' },
  correccion: { label: 'En corrección', cls: 'badge-warn' },
  aprobada: { label: 'Aprobada', cls: 'badge-ok' },
  rechazada: { label: 'Rechazada', cls: 'badge-danger' },
};

type Pestana = 'suscripciones' | 'solicitudes' | 'cobros';

/** AAAA-MM-DD → dd/mm/aaaa (compacto para la tabla). */
const fechaCorta = (f: string | null) => (f ? f.slice(0, 10).split('-').reverse().join('/') : '');

function Vence({ dias }: { dias: number | null }) {
  if (dias == null) return <span className="muted">—</span>;
  if (dias < 0) return <span className="badge badge-danger">Vencido hace {-dias} d</span>;
  if (dias <= 30) return <span className="badge badge-warn">En {dias} d</span>;
  return <span className="muted">En {dias} d</span>;
}

function Consumo({ s }: { s: SuscripcionExpress }) {
  if (s.tope == null) return <span className="num">{formatearNumero(s.consumoCiclo)}</span>;
  const pctUso = Math.min(100, (s.consumoCiclo / s.tope) * 100);
  const excede = s.consumoCiclo > s.tope;
  return (
    <div className={styles.consumo} title={`${formatearNumero(s.consumoCiclo)} de ${formatearNumero(s.tope)} documentos`}>
      <div className={styles.barra}><span style={{ width: `${pctUso}%` }} className={excede ? styles.excede : undefined} /></div>
      <span className="num">{formatearNumero(s.consumoCiclo)} / {formatearNumero(s.tope)}</span>
    </div>
  );
}

export function ExpressPage() {
  const { user } = useAuth();
  const esComercial = user?.rol === 'comercial' || user?.rol === 'administrador';
  const esContabilidad = user?.rol === 'editor' || user?.rol === 'administrador';

  const [pestana, setPestana] = useState<Pestana>('suscripciones');
  const [form, setForm] = useState<{ tipo: TipoSolicitud; suscripcion?: SuscripcionExpress; corrigiendo?: SolicitudExpress } | null>(null);
  const [detalle, setDetalle] = useState<SolicitudExpress | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoSolicitud | ''>('');

  const suscripciones = useQuery({ queryKey: ['express', 'suscripciones'], queryFn: () => api.get<SuscripcionExpress[]>('/express/suscripciones') });
  const solicitudes = useQuery({ queryKey: ['express', 'solicitudes'], queryFn: () => api.get<SolicitudExpress[]>('/express/solicitudes') });
  const cobros = useQuery({ queryKey: ['express', 'cobros'], queryFn: () => api.get<CobroExpress[]>('/express/cobros'), enabled: pestana === 'cobros' });

  const porRevisar = (solicitudes.data ?? []).filter((s) => s.estado === 'enviada').length;
  const enCorreccion = (solicitudes.data ?? []).filter((s) => s.estado === 'correccion').length;
  const b = busqueda.trim().toLowerCase();
  const subs = useMemo(
    () => (suscripciones.data ?? []).filter((s) => !b || s.razonSocial.toLowerCase().includes(b) || s.nit.includes(b)),
    [suscripciones.data, b],
  );
  const sols = (solicitudes.data ?? []).filter(
    (s) => (!filtroEstado || s.estado === filtroEstado) && (!b || s.razonSocial.toLowerCase().includes(b) || s.nit.includes(b)),
  );

  return (
    <div>
      <PageHeader
        titulo="Clientes Express"
        subtitulo="Suscripciones anuales: Comercial registra nuevos clientes, renovaciones y adicionales; Contabilidad aprueba"
        acciones={
          esComercial && (
            <button className="btn btn-primary" onClick={() => setForm({ tipo: 'NUEVO' })}>
              <Plus size={18} /> Nuevo cliente Express
            </button>
          )
        }
      />

      <div className={styles.barraSup}>
        <div className={styles.pestanas} role="tablist">
          {(
            [
              ['suscripciones', `Suscripciones (${suscripciones.data?.length ?? 0})`],
              ['solicitudes', `Solicitudes${porRevisar ? ` · ${porRevisar} por revisar` : ''}${enCorreccion ? ` · ${enCorreccion} en corrección` : ''}`],
              ['cobros', 'Cobros aprobados'],
            ] as [Pestana, string][]
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={pestana === k} className={pestana === k ? styles.activa : undefined} onClick={() => setPestana(k)}>
              {label}
            </button>
          ))}
        </div>
        {pestana !== 'cobros' && (
          <input className="input" placeholder="Buscar cliente o NIT" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ maxWidth: 260 }} />
        )}
      </div>

      {pestana === 'suscripciones' &&
        (suscripciones.isError ? (
          <ErrorState mensaje="No se pudieron cargar las suscripciones" />
        ) : suscripciones.isLoading ? (
          <Spinner label="Cargando…" />
        ) : subs.length === 0 ? (
          <div className="card"><EmptyState titulo="Sin suscripciones Express" descripcion="Se cargan con el maestro de contratos o con una solicitud de cliente nuevo aprobada." /></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Servicio</th>
                  <th className="right">Plan</th>
                  <th>Vigencia</th>
                  <th>Consumo del ciclo</th>
                  {esComercial && <th />}
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.contratoId}>
                    <td style={{ minWidth: 180 }}>
                      <div style={{ fontWeight: 500 }}>{s.razonSocial}</div>
                      <div className="muted mono" style={{ fontSize: 'var(--text-xs)' }}>{s.nit}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{s.servicio}</td>
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      <Money valor={s.valorAnual} />
                      <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>hasta {formatearNumero(s.tope)} docs</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 'var(--text-sm)' }}>
                      {fechaCorta(s.vigenciaDesde)} – {s.vigenciaHasta ? fechaCorta(s.vigenciaHasta) : 'sin fin'}
                      {s.diasParaVencer != null && <div style={{ marginTop: 4 }}><Vence dias={s.diasParaVencer} /></div>}
                    </td>
                    <td><Consumo s={s} /></td>
                    {esComercial && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {s.solicitudPendiente ? (
                          <div className={styles.pendiente}>
                            <span className="muted">{TIPO[s.solicitudPendiente.tipo]}</span>
                            <span className={`badge ${ESTADO[s.solicitudPendiente.estado].cls}`}>{ESTADO[s.solicitudPendiente.estado].label}</span>
                          </div>
                        ) : (
                          <div className={styles.acciones}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setForm({ tipo: 'RENOVACION', suscripcion: s })}>
                              <RotateCcw size={14} /> Renovar
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setForm({ tipo: 'COBRO_ADICIONAL', suscripcion: s })}>
                              Cobrar adicionales
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {pestana === 'solicitudes' && (
        <>
          <div className={styles.chips}>
            {(['', 'enviada', 'correccion', 'aprobada', 'rechazada'] as const).map((e) => (
              <button key={e || 'todas'} className={`badge ${filtroEstado === e ? 'badge-primary' : 'badge-neutral'}`} onClick={() => setFiltroEstado(e)}>
                {e ? ESTADO[e].label : 'Todas'}
              </button>
            ))}
          </div>
          {solicitudes.isError ? (
            <ErrorState mensaje="No se pudieron cargar las solicitudes" />
          ) : solicitudes.isLoading ? (
            <Spinner label="Cargando…" />
          ) : sols.length === 0 ? (
            <div className="card"><EmptyState titulo="Sin solicitudes" /></div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="right">#</th>
                    <th>Tipo</th>
                    <th>Cliente</th>
                    <th>Servicio</th>
                    <th className="right">Valor a cobrar</th>
                    <th>Creada por</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {sols.map((s) => (
                    <tr key={s.id} className="clickable" onClick={() => setDetalle(s)}>
                      <td className="right num">{s.id}</td>
                      <td>{TIPO[s.tipo]}{s.noRenueva && <span className="muted"> · no renueva</span>}</td>
                      <td>{s.razonSocial}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{s.servicio}</td>
                      <td className="right"><Money valor={Math.round(((s.valorAnual ?? 0) + (s.cantidadAdicional ?? 0) * (s.precioAdicional ?? 0)) * 100) / 100} /></td>
                      <td style={{ fontSize: 'var(--text-sm)' }}>{s.usuarioCreo}<div className="muted">{formatearFecha(s.fechaCreacion)}</div></td>
                      <td><span className={`badge ${ESTADO[s.estado].cls}`}>{ESTADO[s.estado].label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {pestana === 'cobros' &&
        (cobros.isError ? (
          <ErrorState mensaje="No se pudieron cargar los cobros" />
        ) : cobros.isLoading ? (
          <Spinner label="Cargando…" />
        ) : (cobros.data ?? []).length === 0 ? (
          <div className="card"><EmptyState titulo="Sin cobros aprobados" descripcion="Cada solicitud aprobada genera aquí su cobro, listo para facturar." /></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Descripción</th>
                  <th className="right">Subtotal</th>
                  <th className="right">IVA</th>
                  <th className="right">Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {cobros.data!.map((c) => (
                  <tr key={c.id}>
                    <td>{c.cliente.razonSocial}<div className="muted" style={{ fontSize: 'var(--text-xs)' }}>{formatearFecha(c.fechaCreacion)}</div></td>
                    <td style={{ fontSize: 'var(--text-sm)' }}>{c.descripcion}</td>
                    <td className="right"><Money valor={c.subtotal} /></td>
                    <td className="right"><Money valor={c.iva} /></td>
                    <td className="right" style={{ fontWeight: 600 }}><Money valor={c.total} /></td>
                    <td><span className="badge badge-neutral">{c.estado === 'por_facturar' ? 'Por facturar' : 'Facturado'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {form && (
        <SolicitudExpressModal tipo={form.tipo} suscripcion={form.suscripcion} corrigiendo={form.corrigiendo} onClose={() => setForm(null)} />
      )}
      {detalle && (
        <DetalleSolicitud
          s={detalle}
          suscripcion={suscripciones.data?.find((x) => x.contratoId === detalle.contratoId)}
          puedeRevisar={esContabilidad && detalle.usuarioCreo !== user?.username}
          avisoPropia={esContabilidad && detalle.usuarioCreo === user?.username && detalle.estado === 'enviada'}
          puedeCorregir={esComercial && detalle.estado === 'correccion'}
          onCorregir={() => {
            setForm({ tipo: detalle.tipo, suscripcion: suscripciones.data?.find((x) => x.contratoId === detalle.contratoId), corrigiendo: detalle });
            setDetalle(null);
          }}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}

function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.dato}>
      <span className="muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function DetalleSolicitud({
  s,
  suscripcion,
  puedeRevisar,
  avisoPropia,
  puedeCorregir,
  onCorregir,
  onClose,
}: {
  s: SolicitudExpress;
  suscripcion?: SuscripcionExpress;
  puedeRevisar: boolean;
  /** Contabilidad viendo una solicitud que ella misma creó: la debe aprobar otra persona. */
  avisoPropia: boolean;
  puedeCorregir: boolean;
  onCorregir: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [accion, setAccion] = useState<'aprobar' | 'correccion' | 'rechazar' | null>(null);
  const [comentario, setComentario] = useState('');

  const revisar = useMutation({
    mutationFn: (a: 'aprobar' | 'correccion' | 'rechazar') =>
      api.patch(`/express/solicitudes/${s.id}/${a}`, a === 'aprobar' ? undefined : { comentario }),
    onSuccess: (_d, a) => {
      qc.invalidateQueries({ queryKey: ['express'] });
      toast.exito({ aprobar: 'Solicitud aprobada: el cobro quedó listo para facturar.', correccion: 'Solicitud devuelta a Comercial.', rechazar: 'Solicitud rechazada.' }[a]);
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo completar la acción'),
  });

  const adicional = s.cantidadAdicional && s.precioAdicional ? s.cantidadAdicional * s.precioAdicional : null;
  const enviada = s.estado === 'enviada';

  return (
    <>
      <Modal
        titulo={`${TIPO[s.tipo]} #${s.id}`}
        onClose={onClose}
        maxWidth={560}
        footer={
          puedeRevisar && enviada ? (
            <>
              <button className="btn btn-ghost" onClick={() => setAccion('rechazar')}><CircleX size={16} /> Rechazar</button>
              <button className="btn btn-secondary" onClick={() => setAccion('correccion')}><Undo2 size={16} /> Pedir corrección</button>
              <button className="btn btn-primary" onClick={() => setAccion('aprobar')}><CircleCheck size={16} /> Aprobar</button>
            </>
          ) : puedeCorregir ? (
            <>
              <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
              <button className="btn btn-primary" onClick={onCorregir}>Corregir y reenviar</button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
          )
        }
      >
        <div className={styles.cabecera}>
          <span className={`badge ${ESTADO[s.estado].cls}`}>{ESTADO[s.estado].label}</span>
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>{s.razonSocial} · NIT {s.nit} · {s.servicio}</span>
        </div>

        {s.comentarioRevision && (
          <div className={styles.comentario}>
            <strong>{s.estado === 'rechazada' ? 'Motivo del rechazo' : 'Comentario de Contabilidad'}:</strong> {s.comentarioRevision}
          </div>
        )}

        <div className={styles.datos}>
          {s.tope != null && <Dato label="Plan">{formatearNumero(s.tope)} documentos por {formatearMoneda(s.valorAnual)} al año</Dato>}
          {s.vigenciaDesde && <Dato label="Ciclo">{formatearFecha(s.vigenciaDesde)} – {formatearFecha(s.vigenciaHasta)}</Dato>}
          {suscripcion && s.tipo !== 'NUEVO' && (
            <Dato label="Plan anterior">{formatearNumero(suscripcion.tope)} documentos por {formatearMoneda(suscripcion.valorAnual)}</Dato>
          )}
          {suscripcion && (
            <Dato label="Consumo del ciclo (BigQuery)">
              {formatearNumero(suscripcion.consumoCiclo)}
              {suscripcion.tope != null && ` de ${formatearNumero(suscripcion.tope)}`}
              {suscripcion.tope != null && suscripcion.consumoCiclo > suscripcion.tope && (
                <span style={{ color: 'var(--warn)' }}> · excede en {formatearNumero(suscripcion.consumoCiclo - suscripcion.tope)}</span>
              )}
            </Dato>
          )}
          {adicional != null && (
            <Dato label="Adicionales">
              {formatearNumero(s.cantidadAdicional)} × {formatearMoneda(s.precioAdicional, 2)} = <strong>{formatearMoneda(adicional, 2)}</strong>
            </Dato>
          )}
          {s.noRenueva && <Dato label="Renovación">El cliente no renueva: la suscripción se da de baja al aprobar.</Dato>}
          {s.tipo === 'NUEVO' && (
            <Dato label="Retenciones">
              RteFte {((s.tasaRtefte ?? 0) * 100).toFixed(1)}% · RteIVA {((s.tasaRteiva ?? 0) * 100).toFixed(0)}% · RteICA {((s.tasaRteica ?? 0) * 100).toFixed(3)}%
            </Dato>
          )}
          {s.observaciones && <Dato label="Observaciones">{s.observaciones}</Dato>}
          <Dato label="Soporte">
            {s.adjuntoNombre ? (
              <button className="btn btn-ghost btn-sm" onClick={() => abrirArchivo(`/express/solicitudes/${s.id}/adjunto`).catch((e) => toast.error(e.message))}>
                <FileText size={14} /> {s.adjuntoNombre}
              </button>
            ) : (
              <span className="muted">Sin PDF</span>
            )}
          </Dato>
          <Dato label="Trazabilidad">
            <span style={{ fontSize: 'var(--text-sm)' }}>
              Creada por {s.usuarioCreo} el {formatearFecha(s.fechaCreacion)}
              {s.usuarioModifico && <> · corregida por {s.usuarioModifico} el {formatearFecha(s.fechaModificacion)}</>}
              {s.usuarioReviso && <> · revisada por {s.usuarioReviso} el {formatearFecha(s.fechaRevision)}</>}
            </span>
          </Dato>
        </div>
        {avisoPropia && (
          <p className="muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 0 }}>Usted creó esta solicitud: la debe aprobar otra persona de Contabilidad.</p>
        )}
      </Modal>

      {accion === 'aprobar' && (
        <ConfirmDialog
          titulo="Aprobar solicitud"
          mensaje={
            <>
              Se {s.tipo === 'NUEVO' ? 'crea la suscripción' : s.tipo === 'RENOVACION' ? 'renueva la suscripción con el nuevo plan' : 'registra el cobro'} y queda{' '}
              {adicional != null && s.tipo !== 'COBRO_ADICIONAL' ? 'n los cobros' : ' el cobro'} listo para facturar. Verifique que los valores coincidan con el PDF.
            </>
          }
          confirmarLabel="Aprobar"
          confirmando={revisar.isPending}
          onConfirmar={() => revisar.mutate('aprobar')}
          onCancelar={() => setAccion(null)}
        />
      )}
      {(accion === 'correccion' || accion === 'rechazar') && (
        <Modal
          titulo={accion === 'correccion' ? 'Pedir corrección a Comercial' : 'Rechazar solicitud'}
          onClose={() => setAccion(null)}
          maxWidth={480}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setAccion(null)}>Cancelar</button>
              <button
                className={`btn ${accion === 'rechazar' ? 'btn-danger' : 'btn-primary'}`}
                disabled={!comentario.trim() || revisar.isPending}
                onClick={() => revisar.mutate(accion)}
              >
                {accion === 'correccion' ? 'Devolver a Comercial' : 'Rechazar'}
              </button>
            </>
          }
        >
          <label className="field">
            <span className="field-label">{accion === 'correccion' ? 'Qué debe corregir Comercial' : 'Motivo del rechazo'}</span>
            <textarea className="input" rows={3} style={{ height: 'auto', paddingTop: 'var(--space-2)' }} value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={1000} autoFocus />
          </label>
        </Modal>
      )}
    </>
  );
}
