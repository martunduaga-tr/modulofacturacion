import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../common/transformers/numeric.transformer';

@Entity({ schema: 'coe', name: 'parametros_globales' })
export class ParametroGlobal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'clave', type: 'nvarchar', length: 50 })
  clave: string;

  @Column({ name: 'valor', type: 'decimal', precision: 18, scale: 6, transformer: numericTransformer })
  valor: number;

  @Column({ name: 'vigencia_desde', type: 'date' })
  vigenciaDesde: string;

  @Column({ name: 'descripcion', type: 'nvarchar', length: 255, nullable: true })
  descripcion: string | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;
}
