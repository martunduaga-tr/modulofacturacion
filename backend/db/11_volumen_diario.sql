/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   Incremental · volumen diario y variaciones (2026-10-22)
   ----------------------------------------------------------------------------
   - coe.volumen_diario: transacciones por día, NIT y servicio tal como las
     entrega Data (BigQuery). Es la base de las alertas de variación y de la
     gráfica del cliente. Se reemplaza por periodo en cada liquidación.
   - coe.volumen_diario_periodos: qué meses están cargados y hasta qué día. Un
     día sin fila dentro de un periodo cargado es un día en CERO, no un dato
     faltante.

   Se aplica sobre una BD que YA tiene 01-10. Pasos protegidos con IF; el
   centinela (coe.volumen_diario_periodos) se crea al final.
   ============================================================================ */

SET XACT_ABORT ON;
GO

IF OBJECT_ID('coe.volumen_diario') IS NULL
CREATE TABLE coe.volumen_diario (
    fecha       DATE           NOT NULL,
    nit         NVARCHAR(20)   NOT NULL,
    servicio    NVARCHAR(100)  NOT NULL,
    cantidad    INT            NOT NULL,
    CONSTRAINT PK_volumen_diario PRIMARY KEY (fecha, nit, servicio)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_volumen_diario_nit')
    CREATE INDEX IX_volumen_diario_nit ON coe.volumen_diario (nit, servicio, fecha) INCLUDE (cantidad);
GO

-- Centinela de apply-schema.js: va de último.
IF OBJECT_ID('coe.volumen_diario_periodos') IS NULL
CREATE TABLE coe.volumen_diario_periodos (
    periodo        CHAR(7)        NOT NULL CONSTRAINT PK_volumen_diario_periodos PRIMARY KEY,  -- AAAA-MM
    desde          DATE           NOT NULL,
    hasta          DATE           NOT NULL,   -- último día con datos (mes en curso = parcial)
    filas          INT            NOT NULL,
    transacciones  BIGINT         NOT NULL,
    origen         NVARCHAR(30)   NOT NULL,
    fecha_carga    DATETIME2      NOT NULL CONSTRAINT DF_vdp_fecha DEFAULT SYSDATETIME()
);
GO
