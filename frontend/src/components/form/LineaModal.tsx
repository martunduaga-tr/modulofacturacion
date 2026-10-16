import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { Cliente, LineaFacturacion } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { ErrorState } from '../ui/Feedback';
import { ClientePicker } from './ClientePicker';

type FormState = {
  cuentaContable: string;
  unidadNegocio: string;
  plazoDias: string;
  centroCosto: string;
  subCentroCosto: string;
  descCentroCosto: string;
  referencia: string;
  codIfactura: string;
  codSiigo: string;
  concepto: string;
  descripcionFactura: string;
  recibeFra: string;
  correoContacto: string;
  observaciones: string;
  estado: 'activo' | 'inactivo';
};

const vacio: FormState = {
  cuentaContable: '', unidadNegocio: '', plazoDias: '', centroCosto: '', subCentroCosto: '',
  descCentroCosto: '', referencia: '', codIfactura: '', codSiigo: '', concepto: '',
  descripcionFactura: '', recibeFra: '', correoContacto: '', observaciones: '', estado: 'activo',
};

function desde(l: LineaFacturacion): FormState {
  return {
    cuentaContable: l.cuentaContable ?? '', unidadNegocio: l.unidadNegocio ?? '',
    plazoDias: l.plazoDias != null ? String(l.plazoDias) : '', centroCosto: l.centroCosto ?? '',
    subCentroCosto: l.subCentroCosto ?? '', descCentroCosto: l.descCentroCosto ?? '',
    referencia: l.referencia ?? '', codIfactura: l.codIfactura ?? '', codSiigo: l.codSiigo ?? '',
    concepto: l.concepto ?? '', descripcionFactura: l.descripcionFactura ?? '', recibeFra: l.recibeFra ?? '',
    correoContacto: l.correoContacto ?? '', observaciones: l.observaciones ?? '', estado: l.estado,
  };
}

export function LineaModal({ linea, onClose }: { linea: LineaFacturacion | null; onClose: () => void }) {
  const qc = useQueryClient();
  const editar = !!linea;
  const [clienteSel, setClienteSel] = useState<Cliente | null>(linea?.cliente ?? null);
  const [f, setF] = useState<FormState>(linea ? desde(linea) : vacio);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof FormState, v: string) => setF((p) => ({ ...p, [k]: v }));

  const guardar = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        cuentaContable: f.cuentaContable || undefined,
        unidadNegocio: f.unidadNegocio || undefined,
        plazoDias: f.plazoDias === '' ? undefined : Number(f.plazoDias),
        centroCosto: f.centroCosto || undefined,
        subCentroCosto: f.subCentroCosto || undefined,
        descCentroCosto: f.descCentroCosto || undefined,
        referencia: f.referencia || undefined,
        codIfactura: f.codIfactura || undefined,
        codSiigo: f.codSiigo || undefined,
        concepto: f.concepto || undefined,
        descripcionFactura: f.descripcionFactura || undefined,
        recibeFra: f.recibeFra || undefined,
        correoContacto: f.correoContacto || undefined,
        observaciones: f.observaciones || undefined,
        estado: f.estado,
      };
      if (editar) return api.patch(`/lineas-facturacion/${linea!.id}`, body);
      return api.post('/lineas-facturacion', { ...body, clienteId: clienteSel!.id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lineas-facturacion'] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'No se pudo guardar'),
  });

  const campo = (label: string, k: keyof FormState, ph = '') => (
    <div className="field">
      <label className="field-label">{label}</label>
      <input className="input" value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph} />
    </div>
  );

  return (
    <Modal
      titulo={editar ? 'Editar línea de facturación' : 'Nueva línea de facturación'}
      onClose={onClose}
      maxWidth={680}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={guardar.isPending || (!editar && !clienteSel)}
            onClick={() => { setError(null); guardar.mutate(); }}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      {error && <ErrorState mensaje={error} />}

      <div className="field">
        <label className="field-label">Cliente</label>
        {editar ? (
          <div className="input" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-sunken)' }}>
            {clienteSel?.razonSocial} <span className="mono muted" style={{ marginLeft: 8, fontSize: 'var(--text-xs)' }}>
              {clienteSel?.nit?.startsWith('PEND-') ? 'NIT pendiente' : clienteSel?.nit}
            </span>
          </div>
        ) : (
          <ClientePicker seleccionado={clienteSel} onSeleccionar={setClienteSel} />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
        {campo('Cuenta contable', 'cuentaContable', '4155350300')}
        {campo('Unidad de negocio', 'unidadNegocio', 'DOC. ELECTRONICO')}
        {campo('Plazo (días)', 'plazoDias', '30')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
        {campo('Centro de costo', 'centroCosto', '61')}
        {campo('Sub centro de costo', 'subCentroCosto')}
        {campo('Desc. centro de costo', 'descCentroCosto')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 'var(--space-3)' }}>
        {campo('Referencia', 'referencia', 'IFACTURA - Emision')}
        {campo('Cód. iFactura', 'codIfactura', '0103032')}
        {campo('Cód. SIIGO', 'codSiigo', '1')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        {campo('Concepto', 'concepto', 'Factura Electrónica')}
        {campo('Recibe factura', 'recibeFra')}
      </div>
      {campo('Descripción de la factura', 'descripcionFactura')}
      {campo('Correo de contacto', 'correoContacto')}
      <div className="field">
        <label className="field-label">Observaciones</label>
        <textarea
          className="input"
          style={{ height: 64, paddingTop: 8, resize: 'vertical' }}
          value={f.observaciones}
          onChange={(e) => set('observaciones', e.target.value)}
        />
      </div>
      <div className="field" style={{ maxWidth: 220 }}>
        <label className="field-label">Estado</label>
        <select className="select" value={f.estado} onChange={(e) => set('estado', e.target.value)}>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
        </select>
      </div>
    </Modal>
  );
}
