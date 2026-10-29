import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Hojas de negocio para la línea de factura (14_subservicios_hojas.sql). "Emisión - Recepción"
 * es la tarifa conjunta; iSoat, iSeguros e iRecaudo llevan un comentario por hoja para todos sus servicios.
 */
export const CLASIFICADORES = ['Emisión', 'Recepción', 'Emisión - Recepción', 'Nómina', 'Doc Soporte', 'iDocumentos', 'ISALUD', 'iSoat', 'iSeguros', 'iRecaudo'] as const;
export type Clasificador = (typeof CLASIFICADORES)[number];
export type OrigenComentario = 'historial' | 'manual';

/** Texto propio del cliente en la línea de factura: "<clasificador> - <comentario>". */
@Entity({ schema: 'coe', name: 'cliente_comentarios_factura' })
export class ComentarioFactura {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'cliente_id', type: 'int' })
  clienteId: number;

  @Column({ name: 'clasificador', type: 'nvarchar', length: 30 })
  clasificador: Clasificador;

  @Column({ name: 'comentario', type: 'nvarchar', length: 500 })
  comentario: string;

  /** historial = precargado de las facturas; manual = lo escribió Contabilidad. */
  @Column({ name: 'origen', type: 'nvarchar', length: 20, default: 'manual' })
  origen: OrigenComentario;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_modificacion', type: 'datetime2', nullable: true })
  fechaModificacion: Date | null;
}
