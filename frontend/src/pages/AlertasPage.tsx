import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import type { Alerta, AlertasResultado, SeveridadAlerta } from '../lib/types';
import { etiquetaTipoAlerta, MOTIVOS_REVISION } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import { RevisarAlertaModal } from '../components/form/RevisarAlertaModal';
import { PageHeader } from '../components/PageHeader';
import { Spinner, ErrorState, EmptyState } from '../components/ui/Feedback';
import styles from './AlertasPage.module.css';

const CLASE_SEVERIDAD: Record<SeveridadAlerta, string> = {
  critica: 'badge-danger',
  alta: 'badge-warn',
  media: 'badge-neutral',
};

const ETIQUETA_SEVERIDAD: Record<SeveridadAlerta, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
};

/** Un solo lenguaje visual para el chip en ambos estados: el color de severidad
 *  siempre se ve (para reconocerlo de un vistazo); el estado activo/inactivo lo
 *  marca el aro, no un cambio de paleta. */
function claseChip(colorClass: string, activa: boolean): string {
  return `badge ${colorClass} badge-plain ${styles.chip} ${activa ? styles.chipActiva : ''}`;
}

const ES_VARIACION = new Set<string>(['caida_general', 'variacion_diaria', 'variacion_mensual']);

function destino(a: Alerta): string | null {
  if (a.tipo === 'nit_pendiente') return '/reconciliacion';
  if (a.tipo === 'caida_general') return null;
  if (a.tipo === 'variacion_diaria' || a.tipo === 'variacion_mensual') {
    const servicio = typeof a.detalle?.servicio === 'string' ? `?servicio=${encodeURIComponent(a.detalle.servicio)}` : '';
    return `/clientes/${a.clienteId}${servicio}`;
  }
  if (a.contratoId) return `/contratos/${a.contratoId}`;
  return null;
}

export function AlertasPage() {
  const navigate = useNavigate();
  const [severidad, setSeveridad] = useState<SeveridadAlerta | null>(null);
  const [grupo, setGrupo] = useState<'' | 'variaciones' | 'contratos'>('');
  const [verRevisadas, setVerRevisadas] = useState(false);
  const [revisando, setRevisando] = useState<Alerta | null>(null);
  const { user } = useAuth();
  const puedeRevisar = user?.rol === 'administrador' || user?.rol === 'editor';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['alertas', verRevisadas],
    queryFn: () => api.get<AlertasResultado>('/alertas', { incluirRevisadas: verRevisadas ? 'true' : undefined }),
  });

  const alertas = useMemo(
    () =>
      (data?.alertas ?? []).filter(
        (a) => (!severidad || a.severidad === severidad) && (!grupo || (grupo === 'variaciones') === ES_VARIACION.has(a.tipo)),
      ),
    [data, severidad, grupo],
  );

  return (
    <div>
      <PageHeader
        titulo="Alertas"
        subtitulo="Contratos con información incompleta o por vencer, y clientes con un comportamiento de transacciones fuera de lo normal"
      />

      {isError ? (
        <ErrorState mensaje="No se pudieron cargar las alertas" />
      ) : isLoading ? (
        <Spinner label="Cargando…" />
      ) : !data || data.resumen.total === 0 ? (
        <div className="card">
          <EmptyState titulo="Sin alertas" descripcion="No hay clientes ni contratos con problemas detectados." />
        </div>
      ) : (
        <>
          <div className={styles.chips}>
            <select className="select" value={grupo} onChange={(e) => setGrupo(e.target.value as typeof grupo)} style={{ width: 'auto' }} aria-label="Tipo de alerta">
              <option value="">Todos los tipos</option>
              <option value="variaciones">Variaciones de transacciones</option>
              <option value="contratos">Contratos y tarifas</option>
            </select>
            <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)' }}>
              <input type="checkbox" checked={verRevisadas} onChange={(e) => setVerRevisadas(e.target.checked)} /> Mostrar revisadas
            </label>
            <button className={claseChip('badge-primary', severidad === null)} onClick={() => setSeveridad(null)}>
              Todas · {data.resumen.total}
            </button>
            {(['critica', 'alta', 'media'] as SeveridadAlerta[])
              .filter((s) => data.resumen.porSeveridad[s])
              .map((s) => (
                <button
                  key={s}
                  className={claseChip(CLASE_SEVERIDAD[s], severidad === s)}
                  onClick={() => setSeveridad(severidad === s ? null : s)}
                >
                  {ETIQUETA_SEVERIDAD[s]} · {data.resumen.porSeveridad[s]}
                </button>
              ))}
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Severidad</th>
                  <th>Tipo</th>
                  <th>Cliente</th>
                  <th>Contrato</th>
                  <th>Detalle</th>
                  <th aria-label="ir" />
                </tr>
              </thead>
              <tbody>
                {alertas.map((a, i) => {
                  const ir = destino(a);
                  return (
                    <tr key={i} className={ir ? 'clickable' : ''} onClick={() => ir && navigate(ir)}>
                      <td><span className={`badge badge-plain ${CLASE_SEVERIDAD[a.severidad]}`}>{ETIQUETA_SEVERIDAD[a.severidad]}</span></td>
                      <td>{etiquetaTipoAlerta(a.tipo)}</td>
                      <td style={{ fontWeight: 500 }}>{a.clienteNombre}</td>
                      <td className="muted">{a.contratoNombre ?? '—'}</td>
                      <td className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                        {a.mensaje}
                        {a.revision && (
                          <div style={{ marginTop: 4 }}>
                            <span className={`badge badge-plain ${a.diasNuevos?.length ? 'badge-warn' : 'badge-ok'}`}>
                              {a.diasNuevos?.length
                                ? `Días nuevos desde la revisión: ${a.diasNuevos.map((f) => Number(f.slice(8))).join(', ')}`
                                : `Revisada · ${MOTIVOS_REVISION[a.revision.motivo] ?? a.revision.motivo}`}
                            </span>{' '}
                            <span>{a.revision.usuario} · {new Date(a.revision.fecha).toLocaleDateString('es-CO')}{a.revision.nota ? ` · ${a.revision.nota}` : ''}</span>
                          </div>
                        )}
                      </td>
                      <td className="right" style={{ whiteSpace: 'nowrap' }}>
                        {puedeRevisar && a.clave && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRevisando(a);
                            }}
                          >
                            <CheckCircle2 size={14} /> {a.revision ? 'Cambiar revisión' : 'Revisada'}
                          </button>
                        )}
                        {ir && <ArrowRight size={15} className="muted" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {revisando && <RevisarAlertaModal alerta={revisando} onClose={() => setRevisando(null)} />}
    </div>
  );
}
