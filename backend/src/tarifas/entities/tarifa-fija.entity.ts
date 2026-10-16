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

@Entity({ schema: 'coe', name: 'tarifa_fija' })
export class TarifaFija {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'contrato_item_id', type: 'int' })
  contratoItemId: number;

  @Column({ name: 'anio', type: 'smallint' })
  anio: number;

  @Column({ name: 'valor_fijo', type: 'decimal', precision: 18, scale: 4, transformer: numericTransformer })
  valorFijo: number;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_modificacion', type: 'datetime2', nullable: true })
  fechaModificacion: Date | null;

  @ManyToOne(() => ContratoItem, (item) => item.tarifasFijas)
  @JoinColumn({ name: 'contrato_item_id' })
  contratoItem: ContratoItem;
}
