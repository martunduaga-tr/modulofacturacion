import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AccionAuditoria = 'INSERT' | 'UPDATE' | 'DELETE';

@Entity({ schema: 'coe', name: 'auditoria_cambios' })
export class AuditoriaCambio {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'tabla', type: 'nvarchar', length: 100 })
  tabla: string;

  @Column({ name: 'registro_id', type: 'int' })
  registroId: number;

  @Column({ name: 'usuario', type: 'nvarchar', length: 100 })
  usuario: string;

  @Column({ name: 'accion', type: 'nvarchar', length: 20 })
  accion: AccionAuditoria;

  @Column({ name: 'valor_anterior', type: 'nvarchar', length: 'MAX', nullable: true })
  valorAnterior: string | null;

  @Column({ name: 'valor_nuevo', type: 'nvarchar', length: 'MAX', nullable: true })
  valorNuevo: string | null;

  @CreateDateColumn({ name: 'fecha', type: 'datetime2' })
  fecha: Date;
}
