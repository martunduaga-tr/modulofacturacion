/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   Incremental · empalme Data (BigQuery) ↔ tarifario de Contabilidad
   ----------------------------------------------------------------------------
   Validado 1:1 contra las facturas de julio 2026 (backend/src/empalme,
   empalme-piloto-julio.spec.ts). Este script agrega lo que el empalme necesita
   persistir:

   1) conceptos_facturables.codigo_data: el nombre del servicio TAL COMO lo
      reporta Data en la vista Final_View-Consolidate. Es la llave del empalme:
      el tarifario de Contabilidad usa ese mismo nombre (sin tabla de
      equivalencias aparte). + semilla de los 15 servicios que trae la vista.
   2) clientes: segmento (CORPORATIVO/EXPRESS) y perfil tributario. Las
      facturas de julio mostraron que RteIVA/RteICA NO son iguales para todos
      (Confianza y Santa Fe 15% RteIVA, los demás 0; RteICA 0 en los 5).
      NULL = usar la tasa global de parametros_globales.
   3) contratos.codigo: el contrato_id del CSV, para que re-importar el
      tarifario actualice en vez de duplicar.
   4) pre_liquidados: valores de factura en pesos enteros + rechazo con motivo.
   5) empalme_pendientes: el volumen que no encontró contrato/tarifa, con su
      motivo. Se reemplaza en cada corrida del periodo.

   Se aplica sobre una BD que YA tiene 01-07 (ver apply-schema.js). Cada paso
   está protegido con IF: apply-schema no corre el script en una transacción,
   así que si falla a mitad de camino, re-ejecutarlo debe ser seguro. El
   centinela (coe.empalme_pendientes) se crea al final.
   ============================================================================ */

SET XACT_ABORT ON;
GO

/* 1) Llave del servicio en Data -------------------------------------------- */
IF COL_LENGTH('coe.conceptos_facturables', 'codigo_data') IS NULL
    ALTER TABLE coe.conceptos_facturables ADD codigo_data NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_conceptos_codigo_data')
    CREATE UNIQUE INDEX UX_conceptos_codigo_data ON coe.conceptos_facturables (codigo_data)
    WHERE codigo_data IS NOT NULL;
GO

MERGE coe.productos AS dst
USING (VALUES
    ('IFACTURA',    N'iFactura'),
    ('ISALUD',      N'iSalud'),
    ('ISOAT',       N'iSoat'),
    ('ISEGUROS',    N'iSeguros'),
    ('IRECAUDO',    N'iRecaudo'),
    ('IDOCUMENTOS', N'iDocumentos')
) AS src (codigo, nombre)
    ON dst.codigo = src.codigo
WHEN NOT MATCHED THEN
    INSERT (codigo, nombre) VALUES (src.codigo, src.nombre);
GO

/* Servicios de la vista Final_View-Consolidate (julio 2026). */
MERGE coe.conceptos_facturables AS dst
USING (
    SELECT p.id AS producto_id, s.codigo, s.nombre, s.codigo_data
    FROM (VALUES
        ('IFACTURA',    'EMISION',               N'Emisión',                 N'iFactura-Emision'),
        ('IFACTURA',    'RECEPCION',             N'Recepción',               N'iFactura-Recepcion'),
        ('IFACTURA',    'DOCSOPORTE',            N'Documento soporte',       N'iFactura-DocSoporte'),
        ('IFACTURA',    'NOMINA',                N'Nómina electrónica',      N'iFactura-Nomina'),
        ('ISALUD',      'ADMIN_CUENTAS_MEDICAS', N'Admin. cuentas médicas',  N'ISALUD - Admin Cuentas Medicas'),
        ('ISOAT',       'EMISION',               N'Emisión',                 N'iSoat - Emision'),
        ('ISOAT',       'MAIL',                  N'Mail',                    N'iSoat - Mail'),
        ('ISOAT',       'SMS',                   N'SMS',                     N'iSoat - SMS'),
        ('ISOAT',       'OTP',                   N'OTP',                     N'iSoat - OTP'),
        ('ISEGUROS',    'COTIZADORES',           N'Cotizadores',             N'iSeguros - Cotizadores'),
        ('ISEGUROS',    'EMISION',               N'Emisión',                 N'iSeguros - Emisión'),
        ('IRECAUDO',    'IRECAUDO',              N'iRecaudo',                N'IRECAUDO'),
        ('IRECAUDO',    'EXPRESS',               N'iRecaudo Express',        N'IRECAUDO_Express'),
        ('IRECAUDO',    'SILVER',                N'iRecaudo Silver',         N'IRecaudo-Silver'),
        ('IDOCUMENTOS', 'IDOCUMENTOS',           N'iDocumentos',             N'iDocumentos')
    ) AS s (producto, codigo, nombre, codigo_data)
    JOIN coe.productos p ON p.codigo = s.producto
) AS src
    ON dst.producto_id = src.producto_id AND dst.codigo = src.codigo
WHEN MATCHED AND dst.codigo_data IS NULL THEN
    UPDATE SET codigo_data = src.codigo_data, fecha_modificacion = SYSDATETIME()
WHEN NOT MATCHED THEN
    INSERT (producto_id, codigo, nombre, codigo_data)
    VALUES (src.producto_id, src.codigo, src.nombre, src.codigo_data);
GO

/* 2) Segmento y perfil tributario del cliente ------------------------------- */
IF COL_LENGTH('coe.clientes', 'segmento') IS NULL
ALTER TABLE coe.clientes ADD
    segmento     NVARCHAR(20) NOT NULL CONSTRAINT DF_clientes_segmento DEFAULT 'CORPORATIVO',
    tasa_rtefte  DECIMAL(9,6) NULL,
    tasa_rteiva  DECIMAL(9,6) NULL,
    tasa_rteica  DECIMAL(9,6) NULL;
GO
IF OBJECT_ID('coe.CK_clientes_segmento') IS NULL
    ALTER TABLE coe.clientes ADD CONSTRAINT CK_clientes_segmento CHECK (segmento IN ('CORPORATIVO','EXPRESS'));
GO
IF OBJECT_ID('coe.CK_clientes_tasas') IS NULL
ALTER TABLE coe.clientes ADD CONSTRAINT CK_clientes_tasas CHECK (
    (tasa_rtefte IS NULL OR tasa_rtefte BETWEEN 0 AND 1) AND
    (tasa_rteiva IS NULL OR tasa_rteiva BETWEEN 0 AND 1) AND
    (tasa_rteica IS NULL OR tasa_rteica BETWEEN 0 AND 1));
GO

/* 3) Código del contrato en el tarifario ------------------------------------ */
IF COL_LENGTH('coe.contratos', 'codigo') IS NULL
    ALTER TABLE coe.contratos ADD codigo NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_contratos_codigo')
    CREATE UNIQUE INDEX UX_contratos_codigo ON coe.contratos (codigo) WHERE codigo IS NOT NULL;
GO

/* 4) Pre-liquidados: valores de factura y rechazo --------------------------- */
IF COL_LENGTH('coe.pre_liquidados', 'subtotal_factura') IS NULL
ALTER TABLE coe.pre_liquidados ADD
    subtotal_factura  DECIMAL(18,2)  NULL,   -- pesos enteros, como la factura electrónica
    iva_factura       DECIMAL(18,2)  NULL,
    total_factura     DECIMAL(18,2)  NULL,
    usuario_rechazo   NVARCHAR(100)  NULL,
    fecha_rechazo     DATETIME2(0)   NULL,
    motivo_rechazo    NVARCHAR(500)  NULL;
GO

/* 5) Lo que no empalmó en cada corrida -------------------------------------- */
CREATE TABLE coe.empalme_pendientes (
    id                  INT            IDENTITY(1,1) NOT NULL,
    anio                SMALLINT       NOT NULL,
    mes                 TINYINT        NOT NULL,
    nit                 NVARCHAR(20)   NOT NULL,
    servicio            NVARCHAR(150)  NOT NULL,   -- nombre de Data, o servicios del item si es error de cálculo
    cantidad            BIGINT         NOT NULL,
    motivo              NVARCHAR(40)   NOT NULL,
    detalle             NVARCHAR(500)  NULL,
    fecha_creacion      DATETIME2(0)   NOT NULL CONSTRAINT DF_pendientes_fcrea DEFAULT SYSDATETIME(),
    CONSTRAINT PK_empalme_pendientes PRIMARY KEY (id),
    CONSTRAINT CK_pendientes_mes     CHECK (mes BETWEEN 1 AND 12),
    CONSTRAINT CK_pendientes_motivo  CHECK (motivo IN ('NIT_SIN_CONTRATO','CONTRATO_NO_VIGENTE','SERVICIO_SIN_TARIFA',
                                                       'SERVICIO_EN_VARIOS_CONTRATOS','ERROR_CALCULO'))
);
GO
CREATE INDEX IX_pendientes_periodo ON coe.empalme_pendientes (anio, mes);
GO
