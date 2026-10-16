import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Contrato } from './contrato.entity';
import { ContratoItemConcepto } from './contrato-item-concepto.entity';
import { TarifaEscalon } from '../../tarifas/entities/tarifa-escalon.entity';
import { MinimoGarantizado } from '../../tarifas/entities/minimo-garantizado.entity';
import { TarifaFija } from '../../tarifas/entities/tarifa-fija.entity';
import { RecargoFijo } from '../../tarifas/entities/recargo-fijo.entity';

export type ModeloCobro = 'volumen_escalonado' | 'minimo_garantizado' | 'fijo_mensual' | 'bolsa';
export type EstadoItem = 'activo' | 'inactivo';

@Entity({ schema: 'coe', name: 'contrato_items' })
export class ContratoItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'contrato_id', type: 'int' })
  contratoId: number;

  @Column({ name: 'modelo_cobro', type: 'nvarchar', length: 30 })
  modeloCobro: ModeloCobro;

  @Column({ name: 'estado', type: 'nvarchar', length: 20, default: 'activo' })
  estado: EstadoItem;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_modificacion', type: 'datetime2', nullable: true })
  fechaModificacion: Date | null;

  @ManyToOne(() => Contrato, (contrato) => contrato.items)
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @OneToMany(() => ContratoItemConcepto, (concepto) => concepto.contratoItem, { cascade: true })
  conceptos: ContratoItemConcepto[];

  @OneToMany(() => TarifaEscalon, (escalon) => escalon.contratoItem, { cascade: true })
  escalones: TarifaEscalon[];

  @OneToMany(() => MinimoGarantizado, (minimo) => minimo.contratoItem, { cascade: true })
  minimos: MinimoGarantizado[];

  @OneToMany(() => TarifaFija, (fija) => fija.contratoItem, { cascade: true })
  tarifasFijas: TarifaFija[];

  @OneToMany(() => RecargoFijo, (recargo) => recargo.contratoItem, { cascade: true })
  recargos: RecargoFijo[];
}
