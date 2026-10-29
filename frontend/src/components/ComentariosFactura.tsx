import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { CLASIFICADORES, type Clasificador, type ComentarioFactura } from '../lib/types';
import { useToast } from './ui/ToastProvider';
import { Spinner } from './ui/Feedback';

/**
 * Comentario de la línea de factura por clasificador. Viene precargado del
 * historial de facturas del cliente; Contabilidad lo ajusta aquí cuando cambia
 * (contrato, funcionario, orden de compra). Vacío = la línea sale solo con el clasificador.
 */
export function ComentariosFactura({ clienteId, puedeEditar }: { clienteId: number; puedeEditar: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ['comentarios-factura', clienteId],
    queryFn: () => api.get<ComentarioFactura[]>(`/clientes/${clienteId}/comentarios-factura`),
  });
  if (isLoading) return <Spinner label="Cargando comentarios…" />;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 180 }}>Servicio</th>
            <th>Comentario</th>
            <th>Así sale en la factura</th>
            {puedeEditar && <th style={{ width: 110 }} />}
          </tr>
        </thead>
        <tbody>
          {CLASIFICADORES.map((c) => {
            const actual = data?.find((d) => d.clasificador === c);
            // La key incluye el comentario guardado: si cambia en el servidor, la fila arranca con el valor nuevo.
            return <Fila key={`${c}|${actual?.comentario ?? ''}`} clienteId={clienteId} clasificador={c} actual={actual} puedeEditar={puedeEditar} />;
          })}
        </tbody>
      </table>
    </div>
  );
}

function Fila({ clienteId, clasificador, actual, puedeEditar }: {
  clienteId: number;
  clasificador: Clasificador;
  actual?: ComentarioFactura;
  puedeEditar: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [texto, setTexto] = useState(actual?.comentario ?? '');
  const limpio = texto.trim().replace(/\s+/g, ' ');
  const cambio = limpio !== (actual?.comentario ?? '');

  const guardar = useMutation({
    mutationFn: () => api.put(`/clientes/${clienteId}/comentarios-factura`, { clasificador, comentario: limpio }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comentarios-factura', clienteId] });
      toast.exito(limpio ? `Comentario de ${clasificador} guardado.` : `Comentario de ${clasificador} borrado.`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar'),
  });

  return (
    <tr>
      <td>
        {clasificador}
        {actual?.origen === 'historial' && !cambio && (
          <div><span className="badge badge-plain badge-neutral" title="Tomado de sus facturas de 2026">Del historial</span></div>
        )}
      </td>
      <td>
        {puedeEditar ? (
          <input
            className="input"
            value={texto}
            maxLength={500}
            placeholder="Sin comentario"
            onChange={(e) => setTexto(e.target.value)}
            aria-label={`Comentario de ${clasificador}`}
          />
        ) : (
          actual?.comentario ?? <span className="muted">Sin comentario</span>
        )}
      </td>
      <td className="muted">{limpio ? `${clasificador} - ${limpio}` : clasificador}</td>
      {puedeEditar && (
        <td>
          <button className="btn btn-secondary btn-sm" disabled={!cambio || guardar.isPending} onClick={() => guardar.mutate()}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </td>
      )}
    </tr>
  );
}
