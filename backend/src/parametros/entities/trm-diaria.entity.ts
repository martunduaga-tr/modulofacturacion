import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { numericTransformer } from '../../common/transformers/numeric.transformer';

export type FuenteTrm = 'datos.gov.co' | 'manual';

/** TRM vigente en una fecha (15_moneda_trm.sql). La factura en USD usa la del día de emisión. */
@Entity({ schema: 'coe', name: 'trm_diaria' })
export class TrmDiaria {
  /** AAAA-MM-DD */
  @PrimaryColumn({ name: 'fecha', type: 'date' })
  fecha: string;

  @Column({ name: 'valor', type: 'decimal', precision: 18, scale: 6, transformer: numericTransformer })
  valor: number;

  @Column({ name: 'fuente', type: 'nvarchar', length: 20 })
  fuente: FuenteTrm;

  @Column({ name: 'usuario', type: 'nvarchar', length: 100, nullable: true })
  usuario: string | null;

  @CreateDateColumn({ name: 'fecha_registro', type: 'datetime2' })
  fechaRegistro: Date;
}
