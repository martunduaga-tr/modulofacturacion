import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Transacciones de un día por NIT y servicio, tal como las entrega Data (11_volumen_diario.sql). */
@Entity({ schema: 'coe', name: 'volumen_diario' })
export class VolumenDiario {
  @PrimaryColumn({ name: 'fecha', type: 'date' })
  fecha: string;

  @PrimaryColumn({ name: 'nit', type: 'nvarchar', length: 20 })
  nit: string;

  @PrimaryColumn({ name: 'servicio', type: 'nvarchar', length: 100 })
  servicio: string;

  @Column({ name: 'cantidad', type: 'int' })
  cantidad: number;
}

/** Meses cargados y hasta qué día: un día sin fila dentro de un mes cargado vale 0. */
@Entity({ schema: 'coe', name: 'volumen_diario_periodos' })
export class VolumenDiarioPeriodo {
  @PrimaryColumn({ name: 'periodo', type: 'char', length: 7 })
  periodo: string;

  @Column({ name: 'desde', type: 'date' })
  desde: string;

  @Column({ name: 'hasta', type: 'date' })
  hasta: string;

  @Column({ name: 'filas', type: 'int' })
  filas: number;

  @Column({ name: 'transacciones', type: 'bigint', transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  transacciones: number;

  @Column({ name: 'origen', type: 'nvarchar', length: 30 })
  origen: string;

  @Column({ name: 'fecha_carga', type: 'datetime2', default: () => 'SYSDATETIME()' })
  fechaCarga: Date;
}
