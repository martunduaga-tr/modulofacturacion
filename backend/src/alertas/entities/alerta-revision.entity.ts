import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const MOTIVOS_REVISION = ['festivo_o_cierre', 'cliente_confirmo', 'error_data', 'ajuste_factura', 'sin_novedad', 'otro'] as const;
export type MotivoRevision = (typeof MOTIVOS_REVISION)[number];

/** Alerta de variación revisada por Contabilidad (12_alertas_revision.sql). */
@Entity({ schema: 'coe', name: 'alertas_revision' })
export class AlertaRevision {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'clave', type: 'nvarchar', length: 200 })
  clave: string;

  @Column({ name: 'tipo', type: 'nvarchar', length: 30 })
  tipo: string;

  @Column({ name: 'cliente_id', type: 'int', nullable: true })
  clienteId: number | null;

  @Column({ name: 'servicio', type: 'nvarchar', length: 100, nullable: true })
  servicio: string | null;

  @Column({ name: 'periodo', type: 'char', length: 7, nullable: true })
  periodo: string | null;

  @Column({ name: 'motivo', type: 'nvarchar', length: 30 })
  motivo: MotivoRevision;

  @Column({ name: 'nota', type: 'nvarchar', length: 500, nullable: true })
  nota: string | null;

  /** JSON con las fechas revisadas: días nuevos fuera de lo normal reabren la alerta. */
  @Column({ name: 'dias', type: 'nvarchar', length: 'MAX', nullable: true })
  dias: string | null;

  @Column({ name: 'usuario', type: 'nvarchar', length: 100 })
  usuario: string;

  @CreateDateColumn({ name: 'fecha', type: 'datetime2' })
  fecha: Date;
}
