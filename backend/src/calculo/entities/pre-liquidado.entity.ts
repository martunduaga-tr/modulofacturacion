import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { numericTransformer } from '../../common/transformers/numeric.transformer';

export type EstadoPreLiquidado = 'calculado' | 'aprobado' | 'rechazado' | 'facturado';

const dec = { type: 'decimal', transformer: numericTransformer } as const;

@Entity({ schema: 'coe', name: 'pre_liquidados' })
export class PreLiquidado {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'anio', type: 'smallint' })
  anio: number;

  @Column({ name: 'mes', type: 'tinyint' })
  mes: number;

  @Column({ name: 'cliente_id', type: 'int' })
  clienteId: number;

  @Column({ name: 'contrato_item_id', type: 'int' })
  contratoItemId: number;

  // Null cuando el item es "hibrido" (agrupa 2+ servicios): no hay UN producto/
  // concepto que lo represente. El desglose por servicio queda en `desglose`.
  @Column({ name: 'producto_id', type: 'int', nullable: true })
  productoId: number | null;

  @Column({ name: 'concepto_id', type: 'int', nullable: true })
  conceptoId: number | null;

  @Column({ name: 'volumen', type: 'bigint', transformer: numericTransformer })
  volumen: number;

  @Column({ name: 'modelo_cobro', type: 'nvarchar', length: 30 })
  modeloCobro: string;

  @Column({ name: 'anio_tarifa', type: 'smallint' })
  anioTarifa: number;

  @Column({ name: 'escalon_id', type: 'int', nullable: true })
  escalonId: number | null;

  @Column({ name: 'tarifa_unitaria', ...dec, precision: 18, scale: 4, nullable: true })
  tarifaUnitaria: number | null;

  @Column({ name: 'recargo_fijo', ...dec, precision: 18, scale: 2, default: 0 })
  recargoFijo: number;

  @Column({ name: 'subtotal', ...dec, precision: 18, scale: 2 })
  subtotal: number;

  @Column({ name: 'tasa_iva', ...dec, precision: 9, scale: 6 })
  tasaIva: number;
  @Column({ name: 'iva', ...dec, precision: 18, scale: 2 })
  iva: number;
  @Column({ name: 'total', ...dec, precision: 18, scale: 2 })
  total: number;

  @Column({ name: 'tasa_rtefte', ...dec, precision: 9, scale: 6 })
  tasaRtefte: number;
  @Column({ name: 'base_rtefte', ...dec, precision: 18, scale: 2 })
  baseRtefte: number;
  @Column({ name: 'rtefte', ...dec, precision: 18, scale: 2 })
  rtefte: number;

  @Column({ name: 'tasa_rteica', ...dec, precision: 9, scale: 6 })
  tasaRteica: number;
  @Column({ name: 'base_rteica', ...dec, precision: 18, scale: 2 })
  baseRteica: number;
  @Column({ name: 'rteica', ...dec, precision: 18, scale: 2 })
  rteica: number;

  @Column({ name: 'tasa_rteiva', ...dec, precision: 9, scale: 6 })
  tasaRteiva: number;
  @Column({ name: 'base_rteiva', ...dec, precision: 18, scale: 2 })
  baseRteiva: number;
  @Column({ name: 'rteiva', ...dec, precision: 18, scale: 2 })
  rteiva: number;

  @Column({ name: 'tasa_autorretencion', ...dec, precision: 9, scale: 6 })
  tasaAutorretencion: number;
  @Column({ name: 'autorretencion', ...dec, precision: 18, scale: 2 })
  autorretencion: number;

  @Column({ name: 'valor_cartera', ...dec, precision: 18, scale: 2 })
  valorCartera: number;

  @Column({ name: 'estado', type: 'nvarchar', length: 20, default: 'calculado' })
  estado: EstadoPreLiquidado;

  @Column({ name: 'anomalias', type: 'nvarchar', length: 'MAX', nullable: true })
  anomalias: string | null;

  @Column({ name: 'desglose', type: 'nvarchar', length: 'MAX', nullable: true })
  desglose: string | null;

  @Column({ name: 'usuario_aprobo', type: 'nvarchar', length: 100, nullable: true })
  usuarioAprobo: string | null;

  @Column({ name: 'fecha_aprobacion', type: 'datetime2', nullable: true })
  fechaAprobacion: Date | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @ManyToOne(() => Cliente)
  @JoinColumn({ name: 'cliente_id' })
  cliente: Cliente;
}
