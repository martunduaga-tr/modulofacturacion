import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Contrato } from '../../contratos/entities/contrato.entity';

export type EstadoCliente = 'activo' | 'retirado';

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

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_modificacion', type: 'datetime2', nullable: true })
  fechaModificacion: Date | null;

  @OneToMany(() => Contrato, (contrato) => contrato.cliente)
  contratos: Contrato[];

  /** No persistido: poblado por loadRelationCountAndMap en el listado. */
  contratosCount?: number;
}
