import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { api } from '../../lib/api';
import type { Cliente, PaginatedResult } from '../../lib/types';
import { useDebounce } from '../../hooks/useDebounce';
import styles from './ClientePicker.module.css';

interface Props {
  seleccionado: Cliente | null;
  onSeleccionar: (c: Cliente | null) => void;
}

export function ClientePicker({ seleccionado, onSeleccionar }: Props) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const busqueda = useDebounce(texto, 300);

  const { data, isFetching } = useQuery({
    queryKey: ['clientes-picker', busqueda],
    queryFn: () => api.get<PaginatedResult<Cliente>>('/clientes', { busqueda: busqueda || undefined, limit: 8 }),
    enabled: abierto && busqueda.length >= 2,
  });

  if (seleccionado) {
    return (
      <div className={styles.selected}>
        <div>
          <div className={styles.selectedName}>{seleccionado.razonSocial}</div>
          <div className={`${styles.selectedNit} mono`}>
            {seleccionado.nit.startsWith('PEND-') ? 'NIT pendiente' : seleccionado.nit}
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSeleccionar(null)}>
          <X size={16} /> Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div style={{ position: 'relative' }}>
        <Search
          size={16}
          style={{ position: 'absolute', left: 12, top: 11, color: 'var(--ink-subtle)', pointerEvents: 'none' }}
        />
        <input
          className="input"
          style={{ paddingLeft: 38 }}
          placeholder="Buscar por NIT o razón social…"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
        />
      </div>

      {abierto && busqueda.length >= 2 && (
        <div className={styles.dropdown}>
          {isFetching && <div className={styles.empty}>Buscando…</div>}
          {!isFetching && (data?.data.length ?? 0) === 0 && (
            <div className={styles.empty}>Sin resultados. Usa "Cliente nuevo" si no existe.</div>
          )}
          {data?.data.map((c) => (
            <div
              key={c.id}
              className={styles.option}
              onMouseDown={(e) => {
                e.preventDefault();
                onSeleccionar(c);
                setTexto('');
                setAbierto(false);
              }}
            >
              <span className={styles.optionName}>{c.razonSocial}</span>
              <span className={`${styles.optionNit} mono`}>
                {c.nit.startsWith('PEND-') ? 'NIT pendiente' : c.nit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
