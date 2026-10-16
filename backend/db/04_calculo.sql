/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   ETAPA 3 · Ingesta de volúmenes + motor de cálculo
   Tablas coe.volumenes y coe.pre_liquidados — SQL Server
   ----------------------------------------------------------------------------
   - volumenes:     volumen mensual por cliente/producto/concepto (fuente: Excel
                    por ahora; luego, ingesta desde la BD de producción).
   - pre_liquidados: el monto calculado por el motor, CON su desglose completo
                    (trazabilidad fiscal). Estado: calculado → aprobado (humano)
                    → facturado (Etapa 4). Nada se emite sin aprobación.
   ============================================================================ */

SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ---- Volúmenes mensuales ------------------------------------------------- */
CREATE TABLE coe.volumenes (
    id                 INT           IDENTITY(1,1) NOT NULL,
    cliente_id         INT           NOT NULL,
    contrato_item_id   INT           NULL,          -- enlace con la tarifa (si existe)
    producto_id        INT           NOT NULL,
    concepto_id        INT           NOT NULL,
    anio               SMALLINT      NOT NULL,
    mes                TINYINT       NOT NULL,       -- 1..12
    cantidad           BIGINT        NOT NULL,
    origen             NVARCHAR(150) NULL,           -- de dónde vino (archivo/hoja)
    fecha_creacion     DATETIME2(0)  NOT NULL CONSTRAINT DF_volumenes_fcrea DEFAULT SYSDATETIME(),
    CONSTRAINT PK_volumenes        PRIMARY KEY (id),
    CONSTRAINT FK_volumenes_cliente  FOREIGN KEY (cliente_id) REFERENCES coe.clientes(id),
    CONSTRAINT FK_volumenes_item     FOREIGN KEY (contrato_item_id) REFERENCES coe.contrato_items(id),
    CONSTRAINT FK_volumenes_producto FOREIGN KEY (producto_id) REFERENCES coe.productos(id),
    CONSTRAINT FK_volumenes_concepto FOREIGN KEY (concepto_id) REFERENCES coe.conceptos_facturables(id),
    CONSTRAINT CK_volumenes_mes      CHECK (mes BETWEEN 1 AND 12),
    CONSTRAINT CK_volumenes_cant     CHECK (cantidad >= 0),
    CONSTRAINT UQ_volumenes_periodo  UNIQUE (cliente_id, producto_id, concepto_id, anio, mes)
);
GO

/* ---- Pre-liquidados (monto calculado + desglose) ------------------------- */
CREATE TABLE coe.pre_liquidados (
    id                  INT           IDENTITY(1,1) NOT NULL,
    anio                SMALLINT      NOT NULL,       -- periodo facturado
    mes                 TINYINT       NOT NULL,
    cliente_id          INT           NOT NULL,
    contrato_item_id    INT           NOT NULL,       -- solo se calcula lo que tiene tarifa
    producto_id         INT           NOT NULL,
    concepto_id         INT           NOT NULL,

    -- Entradas del cálculo (trazabilidad)
    volumen             BIGINT        NOT NULL,
    modelo_cobro        NVARCHAR(30)  NOT NULL,
    anio_tarifa         SMALLINT      NOT NULL,
    escalon_id          INT           NULL,           -- escalón usado (si aplica)
    tarifa_unitaria     DECIMAL(18,4) NULL,

    -- Resultado (2 decimales, redondeo comercial)
    subtotal            DECIMAL(18,2) NOT NULL,
    tasa_iva            DECIMAL(9,6)  NOT NULL,
    iva                 DECIMAL(18,2) NOT NULL,
    total               DECIMAL(18,2) NOT NULL,
    tasa_rtefte         DECIMAL(9,6)  NOT NULL,
    base_rtefte         DECIMAL(18,2) NOT NULL,
    rtefte              DECIMAL(18,2) NOT NULL,
    tasa_rteica         DECIMAL(9,6)  NOT NULL,
    base_rteica         DECIMAL(18,2) NOT NULL,
    rteica              DECIMAL(18,2) NOT NULL,
    tasa_rteiva         DECIMAL(9,6)  NOT NULL,
    base_rteiva         DECIMAL(18,2) NOT NULL,
    rteiva              DECIMAL(18,2) NOT NULL,
    tasa_autorretencion DECIMAL(9,6)  NOT NULL,
    autorretencion      DECIMAL(18,2) NOT NULL,        -- informativa
    valor_cartera       DECIMAL(18,2) NOT NULL,

    -- Estado / aprobación / IA
    estado              NVARCHAR(20)  NOT NULL CONSTRAINT DF_preliq_estado DEFAULT 'calculado',
    anomalias           NVARCHAR(MAX) NULL,             -- JSON (validación IA, no bloqueante)
    desglose            NVARCHAR(MAX) NULL,             -- JSON completo del cálculo
    usuario_aprobo      NVARCHAR(100) NULL,
    fecha_aprobacion    DATETIME2(0)  NULL,
    fecha_creacion      DATETIME2(0)  NOT NULL CONSTRAINT DF_preliq_fcrea DEFAULT SYSDATETIME(),

    CONSTRAINT PK_pre_liquidados      PRIMARY KEY (id),
    CONSTRAINT FK_preliq_cliente      FOREIGN KEY (cliente_id) REFERENCES coe.clientes(id),
    CONSTRAINT FK_preliq_item         FOREIGN KEY (contrato_item_id) REFERENCES coe.contrato_items(id),
    CONSTRAINT CK_preliq_mes          CHECK (mes BETWEEN 1 AND 12),
    CONSTRAINT CK_preliq_estado       CHECK (estado IN ('calculado','aprobado','rechazado','facturado')),
    -- Idempotencia: un item no se pre-liquida dos veces para el mismo periodo
    CONSTRAINT UQ_preliq_periodo      UNIQUE (contrato_item_id, anio, mes)
);
GO
CREATE INDEX IX_preliq_periodo_estado ON coe.pre_liquidados (anio, mes, estado);
GO
