import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type RolUsuario = 'administrador' | 'editor' | 'lector';
export type EstadoUsuario = 'activo' | 'inactivo';

@Entity({ schema: 'coe', name: 'usuarios' })
export class Usuario {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'username', type: 'nvarchar', length: 100 })
  username: string;

  @Column({ name: 'nombre', type: 'nvarchar', length: 150 })
  nombre: string;

  @Column({ name: 'email', type: 'nvarchar', length: 255, nullable: true })
  email: string | null;

  @Column({ name: 'password_hash', type: 'nvarchar', length: 255, select: false })
  passwordHash: string;

  @Column({ name: 'rol', type: 'nvarchar', length: 20 })
  rol: RolUsuario;

  @Column({ name: 'estado', type: 'nvarchar', length: 20, default: 'activo' })
  estado: EstadoUsuario;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;
}
