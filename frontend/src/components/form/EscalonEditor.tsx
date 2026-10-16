import { useFieldArray, useWatch, type Control, type UseFormRegister } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { validarEscalones, type EscalonInput } from '../../lib/validacionTarifas';
import type { FormContrato } from '../../pages/NuevoContratoPage';
import styles from './EscalonEditor.module.css';

interface Props {
  control: Control<FormContrato>;
  register: UseFormRegister<FormContrato>;
  itemIndex: number;
  /** 'bolsa': el precio es un monto plano por banda, no un valor por unidad. */
  labelPrecio?: string;
  labelAgregar?: string;
}

export function EscalonEditor({ control, register, itemIndex, labelPrecio = 'Precio unitario', labelAgregar = 'escalón' }: Props) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `items.${itemIndex}.escalones`,
  });

  const valores = useWatch({ control, name: `items.${itemIndex}.escalones` }) ?? [];
  const parsed: EscalonInput[] = valores.map((v: { volumenDesde: string; volumenHasta: string; precioUnitario: string }) => ({
    volumenDesde: v?.volumenDesde === '' || v?.volumenDesde == null ? '' : Number(v.volumenDesde),
    volumenHasta: v?.volumenHasta === '' || v?.volumenHasta == null ? '' : Number(v.volumenHasta),
    precioUnitario: v?.precioUnitario === '' || v?.precioUnitario == null ? '' : Number(v.precioUnitario),
  }));
  const { errores, filasMalas } = validarEscalones(parsed);

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Desde</th>
            <th>Hasta</th>
            <th>{labelPrecio}</th>
            <th aria-label="acciones" />
          </tr>
        </thead>
        <tbody>
          {fields.map((field, i) => (
            <tr key={field.id} className={filasMalas.has(i) ? styles.rowBad : ''}>
              <td>
                <input
                  type="number"
                  className="input"
                  placeholder="0"
                  {...register(`items.${itemIndex}.escalones.${i}.volumenDesde`)}
                />
              </td>
              <td>
                <input
                  type="number"
                  className="input"
                  placeholder="100000"
                  {...register(`items.${itemIndex}.escalones.${i}.volumenHasta`)}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  placeholder="50000"
                  {...register(`items.${itemIndex}.escalones.${i}.precioUnitario`)}
                />
              </td>
              <td className={styles.actions}>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => remove(i)}
                  disabled={fields.length === 1}
                  aria-label={`Eliminar escalón ${i + 1}`}
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => append({ volumenDesde: '', volumenHasta: '', precioUnitario: '' })}
      >
        <Plus size={16} /> Agregar {labelAgregar}
      </button>

      {errores.length > 0 && (
        <ul className={styles.errores}>
          {errores.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
