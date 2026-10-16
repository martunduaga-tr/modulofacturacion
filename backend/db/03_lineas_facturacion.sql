/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   ETAPA 2 · Maestro de facturación
   Tabla coe.lineas_facturacion — SQL Server
   ----------------------------------------------------------------------------
   Digitaliza la hoja MATRIZ FACTURACION: los campos FIJOS por cliente que
   definen CÓMO se factura y contabiliza (no el monto). Una línea por cada
   cosa que se le factura recurrentemente a un cliente.

   Enlace con Etapa 1: contrato_item_id (cliente + producto + concepto) cuando
   el cliente tiene contrato en CONTRATOS COE. Los clientes sin contrato
   (los ~600) tienen línea con contrato_item_id NULL.

   FUERA DE ALCANCE (es Etapa 3, motor de cálculo): cantidades, V/R unitario,
   subtotal, IVA, retenciones, total, valor cartera, ingresos por mes.
   ============================================================================ */

SET XACT_ABORT ON;
-- Requerido para el índice único filtrado (WHERE) más abajo:
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE TABLE coe.lineas_facturacion (
    id                   INT            IDENTITY(1,1) NOT NULL,
    cliente_id           INT            NOT NULL,
    contrato_item_id     INT            NULL,         -- enlace con Etapa 1 (si existe contrato)

    -- Identificación contable / fiscal (hoja MATRIZ, columnas del maestro)
    cuenta_contable      NVARCHAR(30)   NULL,         -- F  · CTA CONTABLE (código, puede tener ceros)
    unidad_negocio       NVARCHAR(100)  NULL,         -- G  · UNIDAD DE NEGOCIO (ej. DOC. ELECTRONICO)
    plazo_dias           INT            NULL,         -- I  · PLAZO (días de pago)
    recibe_fra           NVARCHAR(150)  NULL,         -- J  · RECIBE FRA (quién recibe)
    correo_contacto      NVARCHAR(255)  NULL,         -- M  · CORREO CONTACTO

    -- Centro de costo
    centro_costo         NVARCHAR(30)   NULL,         -- N  · COD. CC
    sub_centro_costo     NVARCHAR(30)   NULL,         -- O  · cod. Sub cc
    desc_centro_costo    NVARCHAR(100)  NULL,         -- P  · DESC. CC

    -- Referencias del documento
    referencia           NVARCHAR(150)  NULL,         -- Q  · REFERENCIA (ej. "IFACTURA - Emision")
    cod_ifactura         NVARCHAR(50)   NULL,         -- R  · COD. IFACTURA
    cod_siigo            NVARCHAR(50)   NULL,         -- S  · COD.SIIGO
    concepto             NVARCHAR(150)  NULL,         -- V  · CONCEPTO (ej. "Factura Electrónica")
    descripcion_factura  NVARCHAR(500)  NULL,         -- W  · DESCRIPCION FACTURA
    observaciones        NVARCHAR(MAX)  NULL,         -- Y  · OBSERVACIONES (ref. contrato/notas)

    estado               NVARCHAR(20)   NOT NULL CONSTRAINT DF_lineas_estado DEFAULT 'activo',
    fecha_creacion       DATETIME2(0)   NOT NULL CONSTRAINT DF_lineas_fcrea DEFAULT SYSDATETIME(),
    fecha_modificacion   DATETIME2(0)   NULL,

    CONSTRAINT PK_lineas_facturacion   PRIMARY KEY (id),
    CONSTRAINT FK_lineas_cliente       FOREIGN KEY (cliente_id) REFERENCES coe.clientes(id),
    CONSTRAINT FK_lineas_item          FOREIGN KEY (contrato_item_id) REFERENCES coe.contrato_items(id),
    CONSTRAINT CK_lineas_estado        CHECK (estado IN ('activo','inactivo'))
);
GO

CREATE INDEX IX_lineas_cliente ON coe.lineas_facturacion (cliente_id);
GO

/* Una línea por contrato_item (cuando hay enlace con Etapa 1). El índice
   filtrado permite múltiples filas con contrato_item_id NULL (clientes sin
   contrato) sin chocar con la unicidad. */
CREATE UNIQUE INDEX UQ_lineas_item
    ON coe.lineas_facturacion (contrato_item_id)
    WHERE contrato_item_id IS NOT NULL;
GO
