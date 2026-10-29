/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   Incremental · segmento por contrato (2026-10-22)
   ----------------------------------------------------------------------------
   - El segmento es del CONTRATO, no del cliente: ALKA MOTOR tiene Emisión
     como corporativo y Recepción, Documento Soporte y Nómina como Express
     (13 NIT así en el maestro). Con un solo segmento por cliente, cada carga
     pisaba el de la anterior.
   - coe.clientes.segmento queda como resumen de sus contratos activos:
     CORPORATIVO, EXPRESS o AMBOS. Lo mantiene la aplicación; no se edita.
   - Express: cada servicio es una suscripción aparte con su tarifa y su tope.
     CONJUNTO/SEPARADO (volumen) solo aplica a corporativo.

   Se aplica sobre una BD que YA tiene 01-09. Pasos protegidos con IF; el
   centinela (coe.CK_clientes_segmento_v2) se crea al final.
   ============================================================================ */

SET XACT_ABORT ON;
GO

/* 1) Segmento del contrato --------------------------------------------------- */
IF COL_LENGTH('coe.contratos', 'segmento') IS NULL
    ALTER TABLE coe.contratos ADD
        segmento NVARCHAR(20) NOT NULL CONSTRAINT DF_contratos_segmento DEFAULT 'CORPORATIVO';
GO
IF OBJECT_ID('coe.CK_contratos_segmento') IS NULL
    ALTER TABLE coe.contratos ADD CONSTRAINT CK_contratos_segmento CHECK (segmento IN ('CORPORATIVO','EXPRESS'));
GO

-- Express = suscripción NIT-EXP-SERVICIO o item plan_anual.
UPDATE c SET segmento = 'EXPRESS'
FROM coe.contratos c
WHERE c.segmento <> 'EXPRESS'
  AND (c.codigo LIKE '%-EXP-%'
       OR EXISTS (SELECT 1 FROM coe.contrato_items i WHERE i.contrato_id = c.id AND i.modelo_cobro = 'plan_anual'));
GO

/* 2) Segmento del cliente = resumen de sus contratos -------------------------- */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_clientes_segmento')
    ALTER TABLE coe.clientes DROP CONSTRAINT CK_clientes_segmento;
GO
UPDATE cl SET segmento = s.segmento
FROM coe.clientes cl
JOIN (
    SELECT cliente_id,
           CASE WHEN MIN(segmento) <> MAX(segmento) THEN 'AMBOS' ELSE MIN(segmento) END AS segmento
    FROM coe.contratos
    WHERE estado = 'activo'
    GROUP BY cliente_id
) s ON s.cliente_id = cl.id
WHERE cl.segmento <> s.segmento;
GO

-- Centinela de apply-schema.js: va de último.
IF OBJECT_ID('coe.CK_clientes_segmento_v2') IS NULL
    ALTER TABLE coe.clientes ADD CONSTRAINT CK_clientes_segmento_v2 CHECK (segmento IN ('CORPORATIVO','EXPRESS','AMBOS'));
GO
