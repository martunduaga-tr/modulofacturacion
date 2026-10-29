/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   Incremental · revisión de alertas de variación (2026-10-23)
   ----------------------------------------------------------------------------
   - Contabilidad marca una alerta de variación como revisada con un motivo
     (festivo o cierre del cliente, cliente confirmó, error de Data, se ajusta
     la factura, sin novedad, otro). La alerta deja de salir.
   - `clave` identifica la alerta: tipo + cliente + servicio + mes (o la fecha
     del evento general). `dias` guarda los días que se revisaron: si en el mes
     en curso aparecen días NUEVOS fuera de lo normal, la alerta vuelve a salir.
   - Cada revisión queda además en coe.auditoria_cambios.

   Se aplica sobre una BD que YA tiene 01-11. Centinela: coe.alertas_revision.
   ============================================================================ */

SET XACT_ABORT ON;
GO

IF OBJECT_ID('coe.alertas_revision') IS NULL
CREATE TABLE coe.alertas_revision (
    id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_alertas_revision PRIMARY KEY,
    clave           NVARCHAR(200)  NOT NULL,
    tipo            NVARCHAR(30)   NOT NULL,
    cliente_id      INT            NULL CONSTRAINT FK_alertas_revision_cliente REFERENCES coe.clientes(id),
    servicio        NVARCHAR(100)  NULL,
    periodo         CHAR(7)        NULL,
    motivo          NVARCHAR(30)   NOT NULL,
    nota            NVARCHAR(500)  NULL,
    dias            NVARCHAR(MAX)  NULL,   -- JSON con las fechas revisadas
    usuario         NVARCHAR(100)  NOT NULL,
    fecha           DATETIME2      NOT NULL CONSTRAINT DF_alertas_revision_fecha DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_alertas_revision_clave UNIQUE (clave),
    CONSTRAINT CK_alertas_revision_motivo CHECK (motivo IN
        ('festivo_o_cierre','cliente_confirmo','error_data','ajuste_factura','sin_novedad','otro'))
);
GO
