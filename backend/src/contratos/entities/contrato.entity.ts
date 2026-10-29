import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Cliente, SegmentoContrato } from '../../clientes/entities/cliente.entity';
import { ContratoItem } from './contrato-item.entity';

export type EstadoContrato = 'activo' | 'inactivo';

@Entity({ schema: 'coe', name: 'contratos' })
export class Contrato {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'cliente_id', type: 'int' })
  clienteId: number;

  @Column({ name: 'nombre_contrato', type: 'nvarchar', length: 255 })
  nombreContrato: string;

  /** contrato_id del tarifario CSV de Contabilidad: re-importar actualiza en vez de duplicar. */
  @Column({ name: 'codigo', type: 'nvarchar', length: 100, nullable: true })
  codigo: string | null;

  @Column({ name: 'vigencia_desde', type: 'date', nullable: true })
  vigenciaDesde: string | null;

  @Column({ name: 'vigencia_hasta', type: 'date', nullable: true })
  vigenciaHasta: string | null;

  @Column({ name: 'estado', type: 'nvarchar', length: 20, default: 'activo' })
  estado: EstadoContrato;

  /** Express = suscripción anual de un servicio; corporativo = tarifario mensual. */
  @Column({ name: 'segmento', type: 'nvarchar', length: 20, default: 'CORPORATIVO' })
  segmento: SegmentoContrato;

  @Column({ name: 'observaciones', type: 'nvarchar', length: 'MAX', nullable: true })
  observaciones: string | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_modificacion', type: 'datetime2', nullable: true })
  fechaModificacion: Date | null;

  @ManyToOne(() => Cliente, (cliente) => cliente.contratos)
  @JoinColumn({ name: 'cliente_id' })
  cliente: Cliente;

  @OneToMany(() => ContratoItem, (item) => item.contrato, { cascade: true })
  items: ContratoItem[];
}
