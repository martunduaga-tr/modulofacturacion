import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Contrato } from '../../contratos/entities/contrato.entity';
import { numericTransformer } from '../../common/transformers/numeric.transformer';

export type EstadoCliente = 'activo' | 'retirado';
export type SegmentoContrato = 'CORPORATIVO' | 'EXPRESS';
/** Resumen de los contratos del cliente (10_segmento_contrato.sql): ALKA MOTOR tiene de los dos. */
export type SegmentoCliente = SegmentoContrato | 'AMBOS';


@Entity({ schema: 'coe', name: 'clientes' })
export class Cliente {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'nit', type: 'nvarchar', length: 20 })
  nit: string;

  @Column({ name: 'dv', type: 'nvarchar', length: 2, nullable: true })
  dv: string | null;

  @Column({ name: 'razon_social', type: 'nvarchar', length: 255 })
  razonSocial: string;

  @Column({ name: 'correo_contacto', type: 'nvarchar', length: 255, nullable: true })
  correoContacto: string | null;

  @Column({ name: 'estado', type: 'nvarchar', length: 20, default: 'activo' })
  estado: EstadoCliente;

  @Column({ name: 'observaciones', type: 'nvarchar', length: 'MAX', nullable: true })
  observaciones: string | null;

  @Column({ name: 'segmento', type: 'nvarchar', length: 20, default: 'CORPORATIVO' })
  segmento: SegmentoCliente;

  // Perfil tributario (08_empalme.sql). NULL = la tasa global de parametros_globales.
  @Column({ name: 'tasa_rtefte', type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: numericTransformer })
  tasaRtefte: number | null;

  @Column({ name: 'tasa_rteiva', type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: numericTransformer })
  tasaRteiva: number | null;

  @Column({ name: 'tasa_rteica', type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: numericTransformer })
  tasaRteica: number | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_modificacion', type: 'datetime2', nullable: true })
  fechaModificacion: Date | null;

  @OneToMany(() => Contrato, (contrato) => contrato.cliente)
  contratos: Contrato[];

  /** No persistido: poblado por loadRelationCountAndMap en el listado. */
  contratosCount?: number;
}
