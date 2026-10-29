import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../common/transformers/numeric.transformer';

export type MotivoPendiente =
  | 'NIT_SIN_CONTRATO'
  | 'CONTRATO_NO_VIGENTE'
  | 'SERVICIO_SIN_TARIFA'
  | 'SERVICIO_EN_VARIOS_CONTRATOS'
  | 'ERROR_CALCULO';

/** Volumen de Data que no se pudo cobrar en una corrida del periodo, con su motivo. */
@Entity({ schema: 'coe', name: 'empalme_pendientes' })
export class EmpalmePendiente {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'anio', type: 'smallint' })
  anio: number;

  @Column({ name: 'mes', type: 'tinyint' })
  mes: number;

  @Column({ name: 'nit', type: 'nvarchar', length: 20 })
  nit: string;

  @Column({ name: 'servicio', type: 'nvarchar', length: 150 })
  servicio: string;

  @Column({ name: 'cantidad', type: 'bigint', transformer: numericTransformer })
  cantidad: number;

  @Column({ name: 'motivo', type: 'nvarchar', length: 40 })
  motivo: MotivoPendiente;

  @Column({ name: 'detalle', type: 'nvarchar', length: 500, nullable: true })
  detalle: string | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;
}
