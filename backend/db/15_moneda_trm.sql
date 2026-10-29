/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   Incremental · tarifas en USD con TRM del día de la factura (2026-10-27)
   ----------------------------------------------------------------------------
   Reglas de Contabilidad:
   - La moneda es de cada ítem del contrato: COP por defecto, USD se marca a mano
     (o con la columna `moneda` del tarifario).
   - Un mismo servicio puede tener un ítem en COP y otro en USD en el mismo
     contrato: son cobros distintos sobre las MISMAS transacciones (Seguros del
     Estado, iSeguros - Emisión).
   - La factura sale en pesos con la TRM del DÍA EN QUE SE EMITE LA FACTURA. Al
     liquidar, el valor en pesos es un estimado con la TRM disponible; al marcar
     el cobro como facturado se fija con la TRM de esa fecha (Contabilidad puede
     corregirla; queda en auditoría).

   1) contrato_items.moneda
   2) trm_diaria: TRM por fecha (datos.gov.co, Superfinanciera) o digitada.
   3) pre_liquidados: valor en la moneda del contrato, TRM usada y facturación.

   Se aplica sobre una BD que YA tiene 01-14. Centinela: coe.trm_diaria.
   ============================================================================ */

SET XACT_ABORT ON;
GO

/* 1) Moneda del ítem ---------------------------------------------------------- */
IF COL_LENGTH('coe.contrato_items', 'moneda') IS NULL
    ALTER TABLE coe.contrato_items ADD moneda NVARCHAR(3) NOT NULL CONSTRAINT DF_items_moneda DEFAULT 'COP';
GO
IF OBJECT_ID('coe.CK_items_moneda') IS NULL
    ALTER TABLE coe.contrato_items ADD CONSTRAINT CK_items_moneda CHECK (moneda IN ('COP', 'USD'));
GO

/* 3) Pre-liquidados ----------------------------------------------------------- */
IF COL_LENGTH('coe.pre_liquidados', 'moneda') IS NULL
    ALTER TABLE coe.pre_liquidados ADD
        moneda           NVARCHAR(3)    NOT NULL CONSTRAINT DF_preliq_moneda DEFAULT 'COP',
        subtotal_moneda  DECIMAL(18,2)  NULL,    -- subtotal en la moneda de la tarifa (USD)
        trm              DECIMAL(18,6)  NULL,
        fecha_trm        DATE           NULL,
        trm_definitiva   BIT            NOT NULL CONSTRAINT DF_preliq_trm_def DEFAULT 0,
        fecha_factura    DATE           NULL,
        usuario_facturo  NVARCHAR(100)  NULL;
GO

/* 2) TRM por fecha (va al final: es el centinela) ----------------------------- */
IF OBJECT_ID('coe.trm_diaria') IS NULL
CREATE TABLE coe.trm_diaria (
    fecha           DATE           NOT NULL CONSTRAINT PK_trm_diaria PRIMARY KEY,
    valor           DECIMAL(18,6)  NOT NULL CONSTRAINT CK_trm_valor CHECK (valor > 0),
    fuente          NVARCHAR(20)   NOT NULL CONSTRAINT CK_trm_fuente CHECK (fuente IN ('datos.gov.co', 'manual')),
    usuario         NVARCHAR(100)  NULL,
    fecha_registro  DATETIME2      NOT NULL CONSTRAINT DF_trm_registro DEFAULT SYSDATETIME()
);
GO
