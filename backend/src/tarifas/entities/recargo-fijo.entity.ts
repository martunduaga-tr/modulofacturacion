import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContratoItem } from '../../contratos/entities/contrato-item.entity';
import { numericTransformer } from '../../common/transformers/numeric.transformer';

/**
 * Cargo adicional fijo mensual que se suma al subtotal del item sin importar
 * el volumen (ej. "MANTENIMIENTO" de SAN CARLOS: escala + $1.839.270 cada mes).
 * Independiente del modelo_cobro del item — aplica encima de cualquiera.
 */
@Entity({ schema: 'coe', name: 'recargo_fijo' })
export class RecargoFijo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'contrato_item_id', type: 'int' })
  contratoItemId: number;

  @Column({ name: 'anio', type: 'smallint' })
  anio: number;

  @Column({ name: 'concepto', type: 'nvarchar', length: 50 })
  concepto: string;

  @Column({ name: 'valor', type: 'decimal', precision: 18, scale: 4, transformer: numericTransformer })
  valor: number;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_modificacion', type: 'datetime2', nullable: true })
  fechaModificacion: Date | null;

  @ManyToOne(() => ContratoItem, (item) => item.recargos)
  @JoinColumn({ name: 'contrato_item_id' })
  contratoItem: ContratoItem;
}
