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

@Entity({ schema: 'coe', name: 'tarifa_escalones' })
export class TarifaEscalon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'contrato_item_id', type: 'int' })
  contratoItemId: number;

  @Column({ name: 'anio', type: 'smallint' })
  anio: number;

  @Column({ name: 'volumen_desde', type: 'bigint', transformer: numericTransformer })
  volumenDesde: number;

  @Column({ name: 'volumen_hasta', type: 'bigint', transformer: numericTransformer })
  volumenHasta: number;

  @Column({ name: 'precio_unitario', type: 'decimal', precision: 18, scale: 4, transformer: numericTransformer })
  precioUnitario: number;

  @Column({ name: 'ipc_aplicado', type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: numericTransformer })
  ipcAplicado: number | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_modificacion', type: 'datetime2', nullable: true })
  fechaModificacion: Date | null;

  @ManyToOne(() => ContratoItem, (item) => item.escalones)
  @JoinColumn({ name: 'contrato_item_id' })
  contratoItem: ContratoItem;
}
