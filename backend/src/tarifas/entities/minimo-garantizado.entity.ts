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

@Entity({ schema: 'coe', name: 'minimo_garantizado' })
export class MinimoGarantizado {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'contrato_item_id', type: 'int' })
  contratoItemId: number;

  @Column({ name: 'anio', type: 'smallint' })
  anio: number;

  @Column({ name: 'valor_minimo', type: 'decimal', precision: 18, scale: 4, transformer: numericTransformer })
  valorMinimo: number;

  /**
   * Tope de la banda que cubre el monto plano (franquicia). Ej. ALKA MOTOR:
   * banda 1-1.000 -> volumenTope = 1000. Por debajo o igual, se cobra solo
   * valorMinimo; por encima, el excedente se cobra a la tarifa del escalón
   * donde cae el volumen total (ver MotorCalculoService).
   */
  @Column({ name: 'volumen_tope', type: 'bigint', nullable: true, transformer: numericTransformer })
  volumenTope: number | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_modificacion', type: 'datetime2', nullable: true })
  fechaModificacion: Date | null;

  @ManyToOne(() => ContratoItem, (item) => item.minimos)
  @JoinColumn({ name: 'contrato_item_id' })
  contratoItem: ContratoItem;
}
