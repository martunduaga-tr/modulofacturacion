import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ConceptoFacturable } from './concepto-facturable.entity';

export type EstadoProducto = 'activo' | 'inactivo';

@Entity({ schema: 'coe', name: 'productos' })
export class Producto {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'codigo', type: 'nvarchar', length: 50 })
  codigo: string;

  @Column({ name: 'nombre', type: 'nvarchar', length: 150 })
  nombre: string;

  @Column({ name: 'estado', type: 'nvarchar', length: 20, default: 'activo' })
  estado: EstadoProducto;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_modificacion', type: 'datetime2', nullable: true })
  fechaModificacion: Date | null;

  @OneToMany(() => ConceptoFacturable, (concepto) => concepto.producto)
  conceptos: ConceptoFacturable[];
}
