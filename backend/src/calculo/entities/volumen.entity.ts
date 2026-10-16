import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { numericTransformer } from '../../common/transformers/numeric.transformer';

@Entity({ schema: 'coe', name: 'volumenes' })
export class Volumen {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'cliente_id', type: 'int' })
  clienteId: number;

  @Column({ name: 'contrato_item_id', type: 'int', nullable: true })
  contratoItemId: number | null;

  @Column({ name: 'producto_id', type: 'int' })
  productoId: number;

  @Column({ name: 'concepto_id', type: 'int' })
  conceptoId: number;

  @Column({ name: 'anio', type: 'smallint' })
  anio: number;

  @Column({ name: 'mes', type: 'tinyint' })
  mes: number;

  @Column({ name: 'cantidad', type: 'bigint', transformer: numericTransformer })
  cantidad: number;

  @Column({ name: 'origen', type: 'nvarchar', length: 150, nullable: true })
  origen: string | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @ManyToOne(() => Cliente)
  @JoinColumn({ name: 'cliente_id' })
  cliente: Cliente;
}
