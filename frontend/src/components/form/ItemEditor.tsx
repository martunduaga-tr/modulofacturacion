import { useEffect } from 'react';
import { useFieldArray, useWatch, type Control, type UseFormRegister, type UseFormSetValue } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Trash2, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import type { ConceptoFacturable, Producto } from '../../lib/types';
import { EscalonEditor } from './EscalonEditor';
import { RecargosEditor } from './RecargosEditor';
import type { FormContrato } from '../../pages/NuevoContratoPage';
import styles from './ItemEditor.module.css';

const ANIOS = [2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

interface Props {
  control: Control<FormContrato>;
  register: UseFormRegister<FormContrato>;
  setValue: UseFormSetValue<FormContrato>;
  index: number;
  total: number;
  onRemove: () => void;
  productos: Producto[];
}

export function ItemEditor({ control, register, setValue, index, total, onRemove, productos }: Props) {
  const modelo = useWatch({ control, name: `items.${index}.modeloCobro` });
  const { fields: servicios, append, remove } = useFieldArray({ control, name: `items.${index}.conceptos` });

  return (
    <div className={`card ${styles.item}`}>
      <div className={styles.itemHead}>
        <span className={styles.itemNum}>Item {index + 1}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onRemove}
          disabled={total === 1}
        >
          <Trash2 size={16} /> Quitar item
        </button>
      </div>

      <div className={styles.servicios}>
        {servicios.map((servicio, j) => (
          <ServicioRow
            key={servicio.id}
            control={control}
            register={register}
            setValue={setValue}
            itemIndex={index}
            servicioIndex={j}
            productos={productos}
            onRemove={() => remove(j)}
            puedeQuitar={servicios.length > 1}
          />
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => append({ productoId: '', conceptoId: '' })}
        >
          <Plus size={15} /> Agregar servicio a este item
        </button>
        {servicios.length > 1 && (
          <p className="muted" style={{ fontSize: 'var(--text-xs)', margin: 0 }}>
            Item híbrido: los volúmenes de estos {servicios.length} servicios se suman y se
            liquidan juntos contra la tarifa de abajo.
          </p>
        )}
      </div>

      <div className={styles.grid} style={{ marginTop: 'var(--space-4)' }}>
        <div className="field">
          <label className="field-label">Modelo de cobro</label>
          <select className="select" {...register(`items.${index}.modeloCobro`)}>
            <option value="">Selecciona…</option>
            <option value="volumen_escalonado">Escalonado</option>
            <option value="minimo_garantizado">Mínimo garantizado</option>
            <option value="fijo_mensual">Fijo mensual</option>
            <option value="bolsa">Bolsa (paquete plano por banda)</option>
          </select>
        </div>

        <div className="field">
          <label className="field-label">Año</label>
          <select className="select" {...register(`items.${index}.anio`)}>
            {ANIOS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {modelo && (
        <div className={styles.editor}>
          {modelo === 'fijo_mensual' ? (
            <div className="field" style={{ maxWidth: 260 }}>
              <label className="field-label">Valor fijo mensual</label>
              <input
                type="number"
                step="0.01"
                className="input"
                placeholder="250000"
                {...register(`items.${index}.valorFijo`)}
              />
            </div>
          ) : (
            <>
              {modelo === 'minimo_garantizado' && (
                <div className={styles.grid} style={{ marginBottom: 'var(--space-4)' }}>
                  <div className="field" style={{ maxWidth: 260 }}>
                    <label className="field-label">Valor mínimo garantizado (del año)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      placeholder="183906"
                      {...register(`items.${index}.valorMinimo`)}
                    />
                  </div>
                  <div className="field" style={{ maxWidth: 260 }}>
                    <label className="field-label">Tope de la banda (hasta dónde cubre el mínimo)</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="1000"
                      {...register(`items.${index}.volumenTopeMinimo`)}
                    />
                  </div>
                </div>
              )}
              <label className="field-label" style={{ marginBottom: 'var(--space-2)', display: 'block' }}>
                {modelo === 'bolsa' ? 'Bandas del año (monto plano, no se multiplica por volumen)' : 'Escalones del año'}
              </label>
              <EscalonEditor
                control={control}
                register={register}
                itemIndex={index}
                labelPrecio={modelo === 'bolsa' ? 'Monto de la banda' : 'Precio unitario'}
                labelAgregar={modelo === 'bolsa' ? 'banda' : 'escalón'}
              />
            </>
          )}
          <div style={{ marginTop: 'var(--space-4)' }}>
            <RecargosEditor control={control} register={register} itemIndex={index} />
          </div>
        </div>
      )}
    </div>
  );
}

function ServicioRow({
  control,
  register,
  setValue,
  itemIndex,
  servicioIndex,
  productos,
  onRemove,
  puedeQuitar,
}: {
  control: Control<FormContrato>;
  register: UseFormRegister<FormContrato>;
  setValue: UseFormSetValue<FormContrato>;
  itemIndex: number;
  servicioIndex: number;
  productos: Producto[];
  onRemove: () => void;
  puedeQuitar: boolean;
}) {
  const productoId = useWatch({ control, name: `items.${itemIndex}.conceptos.${servicioIndex}.productoId` });

  const { data: conceptos } = useQuery({
    queryKey: ['conceptos', productoId],
    queryFn: () => api.get<ConceptoFacturable[]>(`/productos/${productoId}/conceptos`),
    enabled: !!productoId,
  });

  // Al cambiar de producto, limpiar el concepto elegido (ya no aplica).
  useEffect(() => {
    setValue(`items.${itemIndex}.conceptos.${servicioIndex}.conceptoId`, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId]);

  return (
    <div className={styles.servicioRow}>
      <div className="field">
        <label className="field-label">Producto</label>
        <select className="select" {...register(`items.${itemIndex}.conceptos.${servicioIndex}.productoId`)}>
          <option value="">Selecciona…</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field-label">Concepto</label>
        <select
          className="select"
          {...register(`items.${itemIndex}.conceptos.${servicioIndex}.conceptoId`)}
          disabled={!productoId}
        >
          <option value="">{productoId ? 'Selecciona…' : 'Elige un producto primero'}</option>
          {conceptos?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onRemove}
        disabled={!puedeQuitar}
        aria-label="Quitar servicio"
        title="Quitar servicio"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
