import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createChart, LineStyle, type IChartApi, type SeriesMarker, type Time } from 'lightweight-charts';
import { api } from '../lib/api';
import type { DiaVariacion, SerieCliente } from '../lib/types';
import { Spinner, ErrorState } from './ui/Feedback';
import styles from './GraficoTransacciones.module.css';

type Vista = 'dia' | 'mes';
type Forma = 'linea' | 'velas';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const n = (v: number) => Math.round(v).toLocaleString('es-CO');
const fechaLarga = (f: string) => `${DIAS[new Date(`${f}T00:00:00Z`).getUTCDay()]} ${Number(f.slice(8))}-${MESES[Number(f.slice(5, 7)) - 1]}-${f.slice(0, 4)}`;
const MARCA: Record<string, string> = { caida: 'Bajó', cero: 'En cero', alza: 'Subió' };
// Azul para el alza: se distingue del naranja de la marca y del rojo de la caída.
const COLOR_ALZA = '#2563a8';

/** Colores del tema leídos de los tokens CSS, para que la gráfica no tenga su propia paleta. */
function colores() {
  const css = getComputedStyle(document.documentElement);
  const v = (k: string) => css.getPropertyValue(k).trim();
  return {
    fondo: v('--surface'), texto: v('--ink-muted'), sutil: v('--ink-subtle'), borde: v('--border'),
    linea: v('--primary'), caida: v('--danger'), fuente: v('--font-sans'),
  };
}

/**
 * Comportamiento de transacciones del cliente: por día (línea con lo esperado y
 * el rango normal) o por mes (línea o velas). Marca caídas, alzas, festivos y
 * eventos generales; es lo que Contabilidad mira al revisar una alerta.
 */
export function GraficoTransacciones({ clienteId, servicioInicial }: { clienteId: number; servicioInicial?: string }) {
  const [servicio, setServicio] = useState(servicioInicial ?? '');
  const [vista, setVista] = useState<Vista>('dia');
  const [forma, setForma] = useState<Forma>('linea');
  const [foco, setFoco] = useState<DiaVariacion | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const grafica = useRef<IChartApi | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['variaciones', clienteId, servicio],
    queryFn: () => api.get<SerieCliente>(`/variaciones/clientes/${clienteId}`, { servicio: servicio || undefined }),
  });

  const anomalos = useMemo(() => (data?.dias ?? []).filter((d) => d.marca || d.festivo || d.general), [data]);

  useEffect(() => {
    if (!contenedor.current || !data || !data.dias.length) return;
    const c = colores();
    const chart = createChart(contenedor.current, {
      autoSize: true,
      layout: { background: { color: c.fondo }, textColor: c.texto, fontFamily: c.fuente, fontSize: 12 },
      grid: { vertLines: { color: c.borde }, horzLines: { color: c.borde } },
      rightPriceScale: { borderColor: c.borde },
      timeScale: { borderColor: c.borde, fixLeftEdge: true, fixRightEdge: true },
      localization: { locale: 'es-CO', priceFormatter: (p: number) => n(p) },
      handleScroll: { mouseWheel: false },
    });
    grafica.current = chart;

    if (vista === 'dia') {
      const esperado = chart.addLineSeries({ color: c.sutil, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: 'Esperado' });
      esperado.setData(data.dias.filter((d) => d.esperado != null).map((d) => ({ time: d.fecha as Time, value: d.esperado! })));
      const real = chart.addLineSeries({ color: c.linea, lineWidth: 2, priceLineVisible: false });
      real.setData(data.dias.map((d) => ({ time: d.fecha as Time, value: d.cantidad })));
      const marcas: SeriesMarker<Time>[] = anomalos.map((d) =>
        d.general
          ? { time: d.fecha as Time, position: 'belowBar', color: c.caida, shape: 'square' }
          : d.festivo
            ? { time: d.fecha as Time, position: 'belowBar', color: c.sutil, shape: 'circle' }
            : d.marca === 'alza'
              ? { time: d.fecha as Time, position: 'aboveBar', color: COLOR_ALZA, shape: 'arrowUp' }
              : { time: d.fecha as Time, position: 'belowBar', color: c.caida, shape: 'arrowDown' },
      );
      real.setMarkers(marcas);
      chart.subscribeCrosshairMove((p) => {
        const f = typeof p.time === 'string' ? p.time : null;
        setFoco(f ? data.dias.find((d) => d.fecha === f) ?? null : null);
      });
    } else if (forma === 'velas') {
      const velas = chart.addCandlestickSeries({
        upColor: c.linea, downColor: c.caida, borderVisible: false, wickUpColor: c.linea, wickDownColor: c.caida, priceLineVisible: false,
      });
      velas.setData(data.meses.map((m) => ({ time: `${m.periodo}-01` as Time, open: m.apertura, high: m.maximo, low: m.minimo, close: m.cierre })));
    } else {
      const total = chart.addLineSeries({ color: c.linea, lineWidth: 2, priceLineVisible: false, pointMarkersVisible: true });
      total.setData(data.meses.map((m) => ({ time: `${m.periodo}-01` as Time, value: m.total })));
    }
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      grafica.current = null;
    };
  }, [data, vista, forma, anomalos]);

  const verDia = (f: string) => {
    // En la vista mensual solo se cambia a la diaria; el zoom se hace con la gráfica ya creada.
    if (vista !== 'dia') return setVista('dia');
    const d = new Date(`${f}T00:00:00Z`).getTime();
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10) as Time;
    grafica.current?.timeScale().setVisibleRange({ from: iso(d - 10 * 86_400_000), to: iso(d + 10 * 86_400_000) });
  };

  if (isLoading) return <Spinner label="Cargando transacciones…" />;
  if (isError || !data) return <ErrorState mensaje="No se pudo cargar el comportamiento del cliente" />;
  if (!data.dias.length) {
    return <p className="muted">Sin transacciones de Data para este cliente en los meses cargados.</p>;
  }

  const unMes = data.meses.length < 2;
  return (
    <div>
      <div className={styles.barra}>
        <select className="select" value={servicio} onChange={(e) => setServicio(e.target.value)} aria-label="Servicio">
          <option value="">Todos los servicios</option>
          {data.servicios.map((s) => (
            <option key={s.servicio} value={s.servicio}>{s.servicio} · {n(s.total)}</option>
          ))}
        </select>
        <div className={styles.segmento} role="group" aria-label="Vista">
          <button type="button" className={vista === 'dia' ? styles.activo : ''} onClick={() => setVista('dia')}>Por día</button>
          <button type="button" className={vista === 'mes' ? styles.activo : ''} onClick={() => setVista('mes')}>Por mes</button>
        </div>
        {vista === 'mes' && (
          <div className={styles.segmento} role="group" aria-label="Forma">
            <button type="button" className={forma === 'linea' ? styles.activo : ''} onClick={() => setForma('linea')}>Línea</button>
            <button type="button" className={forma === 'velas' ? styles.activo : ''} onClick={() => setForma('velas')}>Velas</button>
          </div>
        )}
        <span className={styles.leyenda}>
          {vista === 'dia' ? (
            foco ? (
              <>
                <strong>{fechaLarga(foco.fecha)}</strong> · {n(foco.cantidad)} transacciones
                {foco.esperado != null && <> · esperado {n(foco.esperado)}</>}
                {foco.marca && <> · {MARCA[foco.marca].toLowerCase()}</>}
                {foco.general && <> · caída general</>}
                {foco.festivo && <> · festivo: {foco.festivo}</>}
              </>
            ) : (
              'Pase el mouse por la gráfica para ver el detalle de cada día'
            )
          ) : forma === 'velas' ? (
            'Cada vela: primer y último día del mes, día más bajo y más alto'
          ) : (
            'Total del mes'
          )}
        </span>
      </div>

      {vista === 'dia' && (
        <div className={styles.simbolos}>
          <span><i className={styles.lReal} /> Transacciones</span>
          <span><i className={styles.lEsperado} /> Esperado (mismo día de la semana)</span>
          <span><b className={styles.sAlza}>▲</b> Subió</span>
          <span><b className={styles.sCaida}>▼</b> Bajó o en cero</span>
          <span><b className={styles.sFestivo}>●</b> Festivo</span>
          <span><b className={styles.sCaida}>■</b> Caída general</span>
        </div>
      )}

      <div ref={contenedor} className={styles.grafica} />

      {vista === 'mes' && !unMes && data.meses.length > 0 && !data.meses[data.meses.length - 1].completo && (
        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          {data.meses[data.meses.length - 1].periodo} va hasta el {Number(data.cobertura!.hasta.slice(8))}: el mes aún no está completo, por eso se ve más bajo.
        </p>
      )}

      {vista === 'mes' && unMes && (
        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          Por ahora solo está cargado {data.meses[0]?.periodo}. La comparación mes a mes se llena al traer el histórico desde BigQuery.
        </p>
      )}

      {(data.variaciones.length > 0 || data.mensuales.length > 0) && (
        <div className={styles.alertas}>
          {data.variaciones.map((v) => (
            <div key={`${v.servicio}-${v.periodo}`} className={styles.alerta}>
              <strong>{v.servicio}</strong> · {v.periodo}: mueve el mes {v.variacion > 0 ? '+' : ''}
              {(v.variacion * 100).toFixed(1).replace('.', ',')}% ({v.delta > 0 ? '+' : ''}{n(v.delta)} transacciones
              {v.impactoPesos != null && <>, ≈ {v.impactoPesos < 0 ? '-' : '+'}${n(Math.abs(v.impactoPesos))}</>})
            </div>
          ))}
          {data.mensuales.map((v) => (
            <div key={`m-${v.servicio}-${v.periodo}`} className={styles.alerta}>
              <strong>{v.servicio}</strong> · {v.periodo}: {n(v.total)} contra un promedio de {n(v.base)} ({(v.variacion * 100).toFixed(1).replace('.', ',')}%)
            </div>
          ))}
        </div>
      )}

      {anomalos.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 'var(--space-4)' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Día</th>
                <th className="right">Transacciones</th>
                <th className="right">Esperado</th>
                <th>Qué pasó</th>
              </tr>
            </thead>
            <tbody>
              {anomalos.map((d) => (
                <tr key={d.fecha} className="clickable" onClick={() => verDia(d.fecha)}>
                  <td>{fechaLarga(d.fecha)}</td>
                  <td className="right num">{n(d.cantidad)}</td>
                  <td className="right num muted">{d.esperado != null ? n(d.esperado) : '—'}</td>
                  <td>
                    {d.general ? (
                      <span className="badge badge-danger badge-plain">Caída general (plataforma o Data)</span>
                    ) : d.festivo ? (
                      <span className="badge badge-neutral badge-plain">Festivo · {d.festivo}</span>
                    ) : (
                      <span className={`badge badge-plain ${d.marca === 'alza' ? 'badge-primary' : 'badge-danger'}`}>{MARCA[d.marca!]}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
