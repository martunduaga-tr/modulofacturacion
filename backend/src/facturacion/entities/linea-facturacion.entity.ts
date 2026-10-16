import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { ContratoItem } from '../../contratos/entities/contrato-item.entity';

export type EstadoLinea = 'activo' | 'inactivo';

/** Maestro de facturación (hoja MATRIZ FACTURACION): cómo se factura/contabiliza a un cliente. */
@Entity({ schema: 'coe', name: 'lineas_facturacion' })
export class LineaFacturacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'cliente_id', type: 'int' })
  clienteId: number;

  @Column({ name: 'contrato_item_id', type: 'int', nullable: true })
  contratoItemId: number | null;

  @Column({ name: 'cuenta_contable', type: 'nvarchar', length: 30, nullable: true })
  cuentaContable: string | null;

  @Column({ name: 'unidad_negocio', type: 'nvarchar', length: 100, nullable: true })
  unidadNegocio: string | null;

  @Column({ name: 'plazo_dias', type: 'int', nullable: true })
  plazoDias: number | null;

  @Column({ name: 'recibe_fra', type: 'nvarchar', length: 150, nullable: true })
  recibeFra: string | null;

  @Column({ name: 'correo_contacto', type: 'nvarchar', length: 255, nullable: true })
  correoContacto: string | null;

  @Column({ name: 'centro_costo', type: 'nvarchar', length: 30, nullable: true })
  centroCosto: string | null;

  @Column({ name: 'sub_centro_costo', type: 'nvarchar', length: 30, nullable: true })
  subCentroCosto: string | null;

  @Column({ name: 'desc_centro_costo', type: 'nvarchar', length: 100, nullable: true })
  descCentroCosto: string | null;

  @Column({ name: 'referencia', type: 'nvarchar', length: 150, nullable: true })
  referencia: string | null;

  @Column({ name: 'cod_ifactura', type: 'nvarchar', length: 50, nullable: true })
  codIfactura: string | null;

  @Column({ name: 'cod_siigo', type: 'nvarchar', length: 50, nullable: true })
  codSiigo: string | null;

  @Column({ name: 'concepto', type: 'nvarchar', length: 150, nullable: true })
  concepto: string | null;

  @Column({ name: 'descripcion_factura', type: 'nvarchar', length: 500, nullable: true })
  descripcionFactura: string | null;

  @Column({ name: 'observaciones', type: 'nvarchar', length: 'MAX', nullable: true })
  observaciones: string | null;

  @Column({ name: 'estado', type: 'nvarchar', length: 20, default: 'activo' })
  estado: EstadoLinea;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'datetime2' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_modificacion', type: 'datetime2', nullable: true })
  fechaModificacion: Date | null;

  @ManyToOne(() => Cliente)
  @JoinColumn({ name: 'cliente_id' })
  cliente: Cliente;

  @ManyToOne(() => ContratoItem, { nullable: true })
  @JoinColumn({ name: 'contrato_item_id' })
  contratoItem: ContratoItem | null;
}
