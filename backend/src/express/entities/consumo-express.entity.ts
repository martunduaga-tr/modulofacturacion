import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../common/transformers/numeric.transformer';

/** Transacciones del mes de una suscripción Express, guardadas por el empalme (referencia frente al tope). */
@Entity({ schema: 'coe', name: 'express_consumos' })
export class ConsumoExpress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'contrato_item_id', type: 'int' })
  contratoItemId: number;

  @Column({ name: 'anio', type: 'smallint' })
  anio: number;

  @Column({ name: 'mes', type: 'tinyint' })
  mes: number;

  @Column({ name: 'cantidad', type: 'bigint', transformer: numericTransformer })
  cantidad: number;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;
}
