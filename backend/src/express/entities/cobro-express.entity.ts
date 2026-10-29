import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../common/transformers/numeric.transformer';
import { Cliente } from '../../clientes/entities/cliente.entity';

const dec = { type: 'decimal', transformer: numericTransformer } as const;

/** Cobro generado al aprobar una solicitud Express (plan anual o adicionales). */
@Entity({ schema: 'coe', name: 'express_cobros' })
export class CobroExpress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'solicitud_id', type: 'int' })
  solicitudId: number;

  @Column({ name: 'cliente_id', type: 'int' })
  clienteId: number;

  @ManyToOne(() => Cliente)
  @JoinColumn({ name: 'cliente_id' })
  cliente: Cliente;

  @Column({ name: 'contrato_id', type: 'int' })
  contratoId: number;

  @Column({ name: 'concepto', type: 'nvarchar', length: 20 })
  concepto: 'PLAN_ANUAL' | 'ADICIONALES';

  @Column({ name: 'descripcion', type: 'nvarchar', length: 500 })
  descripcion: string;

  @Column({ name: 'cantidad', type: 'bigint', transformer: numericTransformer })
  cantidad: number;

  @Column({ name: 'valor_unitario', ...dec, precision: 18, scale: 4 })
  valorUnitario: number;

  @Column({ name: 'subtotal', ...dec, precision: 18, scale: 2 })
  subtotal: number;

  @Column({ name: 'iva', ...dec, precision: 18, scale: 2 })
  iva: number;

  @Column({ name: 'total', ...dec, precision: 18, scale: 2 })
  total: number;

  @Column({ name: 'rtefte', ...dec, precision: 18, scale: 2 })
  rtefte: number;

  @Column({ name: 'rteiva', ...dec, precision: 18, scale: 2 })
  rteiva: number;

  @Column({ name: 'rteica', ...dec, precision: 18, scale: 2 })
  rteica: number;

  @Column({ name: 'desglose', type: 'nvarchar', length: 'MAX', nullable: true })
  desglose: string | null;

  @Column({ name: 'estado', type: 'nvarchar', length: 20, default: 'por_facturar' })
  estado: 'por_facturar' | 'facturado';

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;
}
