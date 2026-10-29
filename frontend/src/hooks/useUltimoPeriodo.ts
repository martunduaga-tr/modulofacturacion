import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/** Mes cerrado anterior a hoy: el que normalmente se liquida. */
function mesAnterior() {
  const hoy = new Date();
  return hoy.getMonth() === 0 ? { anio: hoy.getFullYear() - 1, mes: 12 } : { anio: hoy.getFullYear(), mes: hoy.getMonth() };
}

/**
 * Periodo (año/mes) de las pantallas de liquidación. Abre en el último mes que
 * tiene pre-liquidados; si no hay ninguno, en el mes cerrado anterior. Una vez
 * que el usuario cambia el selector, no se vuelve a mover solo.
 */
export function useUltimoPeriodo() {
  // null = el usuario no ha tocado el selector: se sigue el último periodo liquidado.
  const [elegido, setElegido] = useState<{ anio: number; mes: number } | null>(null);
  const ultimo = useQuery({
    queryKey: ['pre-liquidados', 'ultimo-periodo'],
    queryFn: () => api.get<{ anio: number; mes: number } | null>('/pre-liquidados/ultimo-periodo'),
  });
  const periodo = elegido ?? ultimo.data ?? mesAnterior();

  return {
    anio: periodo.anio,
    mes: periodo.mes,
    setAnio: (anio: number) => setElegido({ ...periodo, anio }),
    setMes: (mes: number) => setElegido({ ...periodo, mes }),
  };
}
