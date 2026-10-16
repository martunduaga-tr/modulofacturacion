import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import type { FormContrato } from '../../pages/NuevoContratoPage';
import styles from './EscalonEditor.module.css';

interface Props {
  control: Control<FormContrato>;
  register: UseFormRegister<FormContrato>;
  itemIndex: number;
}

/** Recargos fijos mensuales del item (ej. "MANTENIMIENTO"): opcionales, se suman siempre al subtotal. */
export function RecargosEditor({ control, register, itemIndex }: Props) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `items.${itemIndex}.recargos`,
  });

  return (
    <div className={styles.wrap}>
      <label className="field-label" style={{ display: 'block' }}>
        Recargos fijos (opcional, se suman siempre al subtotal — ej. mantenimiento)
      </label>
      {fields.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Valor mensual</th>
              <th aria-label="acciones" />
            </tr>
          </thead>
          <tbody>
            {fields.map((field, i) => (
              <tr key={field.id}>
                <td>
                  <input
                    type="text"
                    className="input"
                    placeholder="MANTENIMIENTO"
                    {...register(`items.${itemIndex}.recargos.${i}.concepto`)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    placeholder="1839270"
                    {...register(`items.${itemIndex}.recargos.${i}.valor`)}
                  />
                </td>
                <td className={styles.actions}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => remove(i)}
                    aria-label={`Eliminar recargo ${i + 1}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => append({ concepto: '', valor: '' })}>
        <Plus size={16} /> Agregar recargo
      </button>
    </div>
  );
}
