import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Producto } from './producto.entity';

export type EstadoConcepto = 'activo' | 'inactivo';

@Entity({ schema: 'coe', name: 'conceptos_facturables' })
export class ConceptoFacturable {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'producto_id', type: 'int' })
  productoId: number;

  @Column({ name: 'codigo', type: 'nvarchar', length: 50 })
  codigo: string;

  @Column({ name: 'nombre', type: 'nvarchar', length: 150 })
  nombre: string;

  @Column({ name: 'estado', type: 'nvarchar', length: 20, default: 'activo' })
  estado: EstadoConcepto;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_modificacion', type: 'datetime2', nullable: true })
  fechaModificacion: Date | null;

  @ManyToOne(() => Producto, (producto) => producto.conceptos)
  @JoinColumn({ name: 'producto_id' })
  producto: Producto;
}
