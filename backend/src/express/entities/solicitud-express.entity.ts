import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../common/transformers/numeric.transformer';
import { Contrato } from '../../contratos/entities/contrato.entity';
import type { EstadoSolicitud, TipoSolicitud } from '../express-reglas';

const dec = { type: 'decimal', transformer: numericTransformer, nullable: true } as const;

/** Solicitud de Comercial (cliente nuevo, renovación o cobro de adicionales) que aprueba Contabilidad. */
@Entity({ schema: 'coe', name: 'express_solicitudes' })
export class SolicitudExpress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tipo', type: 'nvarchar', length: 20 })
  tipo: TipoSolicitud;

  @Column({ name: 'estado', type: 'nvarchar', length: 20, default: 'enviada' })
  estado: EstadoSolicitud;

  @Column({ name: 'contrato_id', type: 'int', nullable: true })
  contratoId: number | null;

  @ManyToOne(() => Contrato)
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato | null;

  @Column({ name: 'nit', type: 'nvarchar', length: 20 })
  nit: string;

  @Column({ name: 'razon_social', type: 'nvarchar', length: 255 })
  razonSocial: string;

  @Column({ name: 'servicio', type: 'nvarchar', length: 100 })
  servicio: string;

  @Column({ name: 'tope', type: 'bigint', nullable: true, transformer: numericTransformer })
  tope: number | null;

  @Column({ name: 'valor_anual', ...dec, precision: 18, scale: 2 })
  valorAnual: number | null;

  @Column({ name: 'vigencia_desde', type: 'date', nullable: true })
  vigenciaDesde: string | null;

  @Column({ name: 'vigencia_hasta', type: 'date', nullable: true })
  vigenciaHasta: string | null;

  @Column({ name: 'tasa_rtefte', ...dec, precision: 9, scale: 6 })
  tasaRtefte: number | null;

  @Column({ name: 'tasa_rteiva', ...dec, precision: 9, scale: 6 })
  tasaRteiva: number | null;

  @Column({ name: 'tasa_rteica', ...dec, precision: 9, scale: 6 })
  tasaRteica: number | null;

  @Column({ name: 'cantidad_adicional', type: 'bigint', nullable: true, transformer: numericTransformer })
  cantidadAdicional: number | null;

  @Column({ name: 'precio_adicional', ...dec, precision: 18, scale: 4 })
  precioAdicional: number | null;

  @Column({ name: 'no_renueva', type: 'bit', default: false })
  noRenueva: boolean;

  @Column({ name: 'observaciones', type: 'nvarchar', length: 1000, nullable: true })
  observaciones: string | null;

  @Column({ name: 'adjunto_nombre', type: 'nvarchar', length: 255, nullable: true })
  adjuntoNombre: string | null;

  // Fuera de los SELECT normales: se descarga aparte (GET .../adjunto).
  @Column({ name: 'adjunto_contenido', type: 'varbinary', length: 'MAX', nullable: true, select: false })
  adjuntoContenido: Buffer | null;

  @Column({ name: 'usuario_creo', type: 'nvarchar', length: 100 })
  usuarioCreo: string;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @Column({ name: 'usuario_modifico', type: 'nvarchar', length: 100, nullable: true })
  usuarioModifico: string | null;

  @Column({ name: 'fecha_modificacion', type: 'datetime2', nullable: true })
  fechaModificacion: Date | null;

  @Column({ name: 'usuario_reviso', type: 'nvarchar', length: 100, nullable: true })
  usuarioReviso: string | null;

  @Column({ name: 'fecha_revision', type: 'datetime2', nullable: true })
  fechaRevision: Date | null;

  @Column({ name: 'comentario_revision', type: 'nvarchar', length: 1000, nullable: true })
  comentarioRevision: string | null;
}
