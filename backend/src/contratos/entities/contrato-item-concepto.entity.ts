import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ContratoItem } from './contrato-item.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { ConceptoFacturable } from '../../productos/entities/concepto-facturable.entity';

/**
 * Un servicio (producto+concepto) agrupado dentro de un contrato_item. Un
 * item "normal" tiene exactamente 1 fila aquí; un item "híbrido" (varios
 * servicios liquidados con una sola tabla de tarifa, sobre el volumen sumado)
 * tiene 2+.
 */
@Entity({ schema: 'coe', name: 'contrato_item_conceptos' })
export class ContratoItemConcepto {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'contrato_item_id', type: 'int' })
  contratoItemId: number;

  @Column({ name: 'producto_id', type: 'int' })
  productoId: number;

  @Column({ name: 'concepto_id', type: 'int' })
  conceptoId: number;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @ManyToOne(() => ContratoItem, (item) => item.conceptos)
  @JoinColumn({ name: 'contrato_item_id' })
  contratoItem: ContratoItem;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'producto_id' })
  producto: Producto;

  @ManyToOne(() => ConceptoFacturable)
  @JoinColumn({ name: 'concepto_id' })
  concepto: ConceptoFacturable;
}
