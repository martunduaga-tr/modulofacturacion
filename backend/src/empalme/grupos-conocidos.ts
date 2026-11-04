/**
 * Contratos de grupo conocidos (ver db/17_grupos_tarifa.sql). El grupo se crea y sus miembros se enlazan
 * solos cuando se importa el contrato de uno de ellos (por pantalla de Empalme o por script), así no depende
 * de un paso manual ni del orden de carga: la BD de pruebas se puede vaciar y recargar sin perder el grupo.
 */
export interface GrupoConocido {
  codigo: string;
  nombre: string;
  /** Transacciones mensuales del grupo incluidas en los mínimos. */
  umbralMensual: number;
  tramos: { anio: number; desde: number; hasta: number; precio: number }[];
  /** contrato_id (código del contrato) de cada miembro. */
  miembros: string[];
}

export const GRUPOS_CONOCIDOS: GrupoConocido[] = [
  {
    codigo: 'OSPEDALE',
    nombre: 'Grupo Ospedale: bolsa mensual de Emision',
    umbralMensual: 263250,
    tramos: [
      { anio: 2026, desde: 250001, hasta: 350000, precio: 88.46 },
      { anio: 2026, desde: 350001, hasta: 500000, precio: 59.31 },
      { anio: 2026, desde: 500001, hasta: 700000, precio: 48.7 },
      { anio: 2026, desde: 700001, hasta: 900000, precio: 45.95 },
      { anio: 2026, desde: 900001, hasta: 999999999, precio: 41.84 },
    ],
    miembros: [
      '900930253-FACTURA-2026', '800190884-FACTURA-2026', '900848340-FACTURA-2026', '830113849-FACTURA-2026',
      '817003166-FACTURA-2026', '800094898-FACTURA-2026', '891409981-FACTURA-2026', '810003245-FACTURA-2026',
      '900612531-FACTURA-2026', '900408220-FACTURA-2026', '805023423-FACTURA-2026', '830512116-FACTURA-2026',
    ],
  },
];
