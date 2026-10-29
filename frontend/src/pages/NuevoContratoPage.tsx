import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Cliente, Contrato, ModeloCobro, PaginatedResult, Producto } from '../lib/types';
import { validarItemTarifa, type EscalonInput, type RecargoInput } from '../lib/validacionTarifas';
import { ItemEditor } from '../components/form/ItemEditor';
import { ClientePicker } from '../components/form/ClientePicker';
import { ErrorState, Spinner } from '../components/ui/Feedback';
import { useToast } from '../components/ui/ToastProvider';
import styles from './NuevoContratoPage.module.css';

export interface ItemConceptoForm {
  productoId: string;
  conceptoId: string;
}

interface ItemForm {
  /** Servicios agrupados por el item. 1 = caso normal; 2+ = contrato "híbrido"
   *  (los volúmenes se suman y se liquidan contra una sola tabla de tarifa). */
  conceptos: ItemConceptoForm[];
  modeloCobro: ModeloCobro | '';
  anio: number;
  escalones: { volumenDesde: string; volumenHasta: string; precioUnitario: string }[];
  valorMinimo: string;
  volumenTopeMinimo: string;
  valorFijo: string;
  /** Opcional, para cualquier modelo: se suma siempre al subtotal (ej. mantenimiento). */
  recargos: { concepto: string; valor: string }[];
}

export interface FormContrato {
  clienteMode: 'existente' | 'nuevo';
  nuevoNit: string;
  nuevoRazon: string;
  nuevoCorreo: string;
  nombreContrato: string;
  codigo: string;
  vigenciaDesde: string;
  vigenciaHasta: string;
  items: ItemForm[];
}

const itemVacio = (): ItemForm => ({
  conceptos: [{ productoId: '', conceptoId: '' }],
  modeloCobro: '',
  anio: 2026,
  escalones: [{ volumenDesde: '', volumenHasta: '', precioUnitario: '' }],
  valorMinimo: '',
  volumenTopeMinimo: '',
  valorFijo: '',
  recargos: [],
});

const numOr = (v: string): number | '' => (v === '' ? '' : Number(v));

export function NuevoContratoPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  const { register, control, handleSubmit, watch, setValue } = useForm<FormContrato>({
    defaultValues: {
      clienteMode: 'existente',
      nuevoNit: '',
      nuevoRazon: '',
      nuevoCorreo: '',
      nombreContrato: '',
      codigo: '',
      vigenciaDesde: '',
      vigenciaHasta: '',
      items: [itemVacio()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const clienteMode = watch('clienteMode');

  const { data: productos, isLoading: cargandoProd } = useQuery({
    queryKey: ['productos-form'],
    queryFn: () => api.get<PaginatedResult<Producto>>('/productos', { limit: 100 }),
  });

  function validar(values: FormContrato): string[] {
    const errs: string[] = [];
    if (values.clienteMode === 'existente' && !clienteSel) {
      errs.push('Selecciona un cliente existente o usa "Cliente nuevo".');
    }
    if (values.clienteMode === 'nuevo') {
      if (!values.nuevoNit.trim()) errs.push('El NIT del cliente nuevo es obligatorio.');
      if (!values.nuevoRazon.trim()) errs.push('La razón social del cliente nuevo es obligatoria.');
    }
    if (!values.nombreContrato.trim()) errs.push('El nombre del contrato es obligatorio.');
    if (!values.codigo.trim()) errs.push('El código del contrato es obligatorio.');

    values.items.forEach((it, i) => {
      it.conceptos.forEach((c, j) => {
        if (!c.productoId) errs.push(`Item ${i + 1}, servicio ${j + 1}: selecciona un producto.`);
        if (!c.conceptoId) errs.push(`Item ${i + 1}, servicio ${j + 1}: selecciona un concepto.`);
      });
      const escalones: EscalonInput[] = it.escalones.map((e) => ({
        volumenDesde: numOr(e.volumenDesde),
        volumenHasta: numOr(e.volumenHasta),
        precioUnitario: numOr(e.precioUnitario),
      }));
      const recargos: RecargoInput[] = it.recargos.map((r) => ({ concepto: r.concepto, valor: numOr(r.valor) }));
      validarItemTarifa(it.modeloCobro, escalones, numOr(it.valorMinimo), numOr(it.volumenTopeMinimo), numOr(it.valorFijo), recargos).forEach(
        (e) => errs.push(`Item ${i + 1}: ${e}`),
      );
    });
    return errs;
  }

  function construirTarifa(it: ItemForm) {
    const anio = Number(it.anio);
    const recargosFijos = it.recargos
      .filter((r) => r.concepto.trim() && r.valor !== '')
      .map((r) => ({ concepto: r.concepto.trim(), valor: Number(r.valor) }));
    const conRecargos = <T extends object>(base: T) =>
      recargosFijos.length > 0 ? { ...base, recargosFijos } : base;

    if (it.modeloCobro === 'fijo_mensual') return conRecargos({ anio, valorFijo: Number(it.valorFijo) });
    const escalones = it.escalones.map((e) => ({
      volumenDesde: Number(e.volumenDesde),
      volumenHasta: Number(e.volumenHasta),
      precioUnitario: Number(e.precioUnitario),
    }));
    if (it.modeloCobro === 'minimo_garantizado') {
      return conRecargos({ anio, escalones, valorMinimo: Number(it.valorMinimo), volumenTopeMinimo: Number(it.volumenTopeMinimo) });
    }
    return conRecargos({ anio, escalones });
  }

  async function onSubmit(values: FormContrato) {
    const errs = validar(values);
    setErrores(errs);
    if (errs.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setGuardando(true);
    try {
      // 1. Resolver cliente (existente o crear nuevo)
      let clienteId: number;
      if (values.clienteMode === 'nuevo') {
        const nuevo = await api.post<Cliente>('/clientes', {
          nit: values.nuevoNit.trim(),
          razonSocial: values.nuevoRazon.trim(),
          correoContacto: values.nuevoCorreo.trim() || undefined,
        });
        clienteId = nuevo.id;
      } else {
        clienteId = clienteSel!.id;
      }

      // 2. Crear contrato (transaccional)
      const contrato = await api.post<Contrato>('/contratos', {
        clienteId,
        nombreContrato: values.nombreContrato.trim(),
        codigo: values.codigo.trim(),
        vigenciaDesde: values.vigenciaDesde || undefined,
        vigenciaHasta: values.vigenciaHasta || undefined,
        items: values.items.map((it) => ({
          conceptos: it.conceptos.map((c) => ({
            productoId: Number(c.productoId),
            conceptoId: Number(c.conceptoId),
          })),
          modeloCobro: it.modeloCobro,
          tarifas: [construirTarifa(it)],
        })),
      });

      toast.exito(`Contrato "${values.nombreContrato.trim()}" creado.`);
      navigate(`/contratos/${contrato.id}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'No se pudo guardar el contrato.';
      setErrores([msg]);
      toast.error(msg);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setGuardando(false);
    }
  }

  if (cargandoProd) return <Spinner label="Cargando…" />;

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Link to="/contratos" className={styles.back}>
        <ArrowLeft size={16} /> Volver a contratos
      </Link>
      <h1>Nuevo contrato</h1>
      <p className="muted" style={{ marginBottom: 'var(--space-6)' }}>
        Captura el cliente y uno o más items con su tarifa del año. Un item agrupa uno o
        varios servicios (producto + concepto); si agrupas más de uno, sus volúmenes se
        suman y se liquidan juntos contra la tarifa del item.
      </p>

      {errores.length > 0 && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <ErrorState mensaje={errores.length === 1 ? errores[0] : `Revisa ${errores.length} puntos:`} />
          {errores.length > 1 && (
            <ul className={styles.errList}>
              {errores.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ---- Cliente ---- */}
      <section className={`card ${styles.section}`}>
        <h2 className={styles.sectionTitle}>Cliente</h2>
        <div className={styles.clienteTabs}>
          <label className={styles.radio}>
            <input type="radio" value="existente" {...register('clienteMode')} /> Cliente existente
          </label>
          <label className={styles.radio}>
            <input type="radio" value="nuevo" {...register('clienteMode')} /> Cliente nuevo
          </label>
        </div>

        {clienteMode === 'existente' ? (
          <div className="field">
            <label className="field-label">Buscar cliente</label>
            <ClientePicker seleccionado={clienteSel} onSeleccionar={setClienteSel} />
          </div>
        ) : (
          <div className={styles.grid3}>
            <div className="field">
              <label className="field-label">NIT</label>
              <input className="input" {...register('nuevoNit')} placeholder="900123456" />
            </div>
            <div className="field">
              <label className="field-label">Razón social</label>
              <input className="input" {...register('nuevoRazon')} placeholder="EMPRESA S.A.S." />
            </div>
            <div className="field">
              <label className="field-label">Correo de contacto (opcional)</label>
              <input className="input" type="email" {...register('nuevoCorreo')} placeholder="facturacion@empresa.com" />
            </div>
          </div>
        )}

        <div className={styles.grid3} style={{ marginTop: 'var(--space-4)' }}>
          <div className="field">
            <label className="field-label">Código del contrato</label>
            <input className="input" {...register('codigo')} placeholder="900188916-FACTURA-2026" />
            <span className="field-hint">El mismo del maestro de Contabilidad (contrato_id). Solo corporativos; los Express se crean en la pantalla Express.</span>
          </div>
          <div className="field">
            <label className="field-label">Nombre del contrato</label>
            <input className="input" {...register('nombreContrato')} placeholder="Otro Sí No.1 SG-001" />
          </div>
          <div className="field">
            <label className="field-label">Vigencia desde (opcional)</label>
            <input className="input" type="date" {...register('vigenciaDesde')} />
          </div>
          <div className="field">
            <label className="field-label">Vigencia hasta (opcional)</label>
            <input className="input" type="date" {...register('vigenciaHasta')} />
          </div>
        </div>
      </section>

      {/* ---- Items ---- */}
      <h2 className={styles.sectionTitle} style={{ marginTop: 'var(--space-8)' }}>
        Items facturables
      </h2>
      <div className={styles.items}>
        {fields.map((field, i) => (
          <ItemEditor
            key={field.id}
            control={control}
            register={register}
            setValue={setValue}
            index={i}
            total={fields.length}
            onRemove={() => remove(i)}
            productos={productos?.data ?? []}
          />
        ))}
      </div>

      <button type="button" className="btn btn-secondary" onClick={() => append(itemVacio())} style={{ marginTop: 'var(--space-4)' }}>
        <Plus size={18} /> Agregar item
      </button>

      {/* ---- Footer ---- */}
      <div className={styles.footer}>
        <Link to="/contratos" className="btn btn-ghost">
          Cancelar
        </Link>
        <button type="submit" className="btn btn-primary" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar contrato'}
        </button>
      </div>
    </form>
  );
}
