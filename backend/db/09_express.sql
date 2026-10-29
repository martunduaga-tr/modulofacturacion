/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   Incremental · clientes Express (definiciones del 2026-10-21)
   ----------------------------------------------------------------------------
   - Cada servicio Express es una suscripción anual independiente (un
     contrato con un item de modelo `plan_anual`). El plan (valor anual y tope
     de documentos) se guarda en coe.minimo_garantizado del año en que inicia
     el ciclo: valor_minimo = valor anual, volumen_tope = tope.
   - La carga inicial solo REGISTRA el plan: no genera cobros. Todo cobro
     Express nace de una solicitud de Comercial aprobada por Contabilidad:
       NUEVO           cliente/suscripción nueva        (PDF obligatorio)
       RENOVACION      nuevo ciclo, con o sin cambio de tarifa, y adicionales
                       del ciclo que cierra si los hubo (PDF obligatorio)
       COBRO_ADICIONAL adicionales sin renovación, ej. el cliente no renueva
                       (PDF opcional)
   - Los adicionales los digita Comercial (cantidad × precio): varían por
     cliente. El consumo de BigQuery queda como referencia (express_consumos).
   - Sin aprobación no hay cobro: la renovación queda bloqueada.

   Se aplica sobre una BD que YA tiene 01-08 (ver apply-schema.js). Pasos
   protegidos con IF; el centinela (coe.express_consumos) se crea al final.
   ============================================================================ */

SET XACT_ABORT ON;
GO

/* 1) Rol Comercial ---------------------------------------------------------- */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_usuarios_rol')
    ALTER TABLE coe.usuarios DROP CONSTRAINT CK_usuarios_rol;
GO
ALTER TABLE coe.usuarios ADD CONSTRAINT CK_usuarios_rol
    CHECK (rol IN ('administrador','editor','lector','comercial'));
GO

/* 2) Modelo plan_anual (Express) --------------------------------------------- */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_items_modelo')
    ALTER TABLE coe.contrato_items DROP CONSTRAINT CK_items_modelo;
GO
ALTER TABLE coe.contrato_items ADD CONSTRAINT CK_items_modelo CHECK (modelo_cobro IN
    ('volumen_escalonado','minimo_garantizado','fijo_mensual','bolsa','plan_anual'));
GO

/* 3) Solicitudes de Comercial ----------------------------------------------- */
IF OBJECT_ID('coe.express_solicitudes') IS NULL
CREATE TABLE coe.express_solicitudes (
    id                    INT             IDENTITY(1,1) NOT NULL,
    tipo                  NVARCHAR(20)    NOT NULL,
    estado                NVARCHAR(20)    NOT NULL CONSTRAINT DF_solexp_estado DEFAULT 'enviada',
    -- Suscripción existente (RENOVACION / COBRO_ADICIONAL) o datos del cliente nuevo (NUEVO)
    contrato_id           INT             NULL,
    nit                   NVARCHAR(20)    NOT NULL,
    razon_social          NVARCHAR(255)   NOT NULL,
    servicio              NVARCHAR(100)   NOT NULL,      -- codigo_data del servicio
    -- Plan (NUEVO / RENOVACION)
    tope                  BIGINT          NULL,
    valor_anual           DECIMAL(18,2)   NULL,
    vigencia_desde        DATE            NULL,
    vigencia_hasta        DATE            NULL,
    -- Retenciones del cliente (NUEVO)
    tasa_rtefte           DECIMAL(9,6)    NULL,
    tasa_rteiva           DECIMAL(9,6)    NULL,
    tasa_rteica           DECIMAL(9,6)    NULL,
    -- Adicionales digitados por Comercial
    cantidad_adicional    BIGINT          NULL,
    precio_adicional      DECIMAL(18,4)   NULL,
    no_renueva            BIT             NOT NULL CONSTRAINT DF_solexp_norenueva DEFAULT 0,
    observaciones         NVARCHAR(1000)  NULL,
    -- Soporte (no se interpreta: solo se guarda para revisión)
    adjunto_nombre        NVARCHAR(255)   NULL,
    adjunto_contenido     VARBINARY(MAX)  NULL,
    -- Trazabilidad
    usuario_creo          NVARCHAR(100)   NOT NULL,
    fecha_creacion        DATETIME2(0)    NOT NULL CONSTRAINT DF_solexp_fcrea DEFAULT SYSDATETIME(),
    usuario_modifico      NVARCHAR(100)   NULL,
    fecha_modificacion    DATETIME2(0)    NULL,
    usuario_reviso        NVARCHAR(100)   NULL,
    fecha_revision        DATETIME2(0)    NULL,
    comentario_revision   NVARCHAR(1000)  NULL,
    CONSTRAINT PK_express_solicitudes PRIMARY KEY (id),
    CONSTRAINT FK_solexp_contrato     FOREIGN KEY (contrato_id) REFERENCES coe.contratos(id),
    CONSTRAINT CK_solexp_tipo         CHECK (tipo IN ('NUEVO','RENOVACION','COBRO_ADICIONAL')),
    CONSTRAINT CK_solexp_estado       CHECK (estado IN ('enviada','correccion','aprobada','rechazada')),
    CONSTRAINT CK_solexp_adicional    CHECK ((cantidad_adicional IS NULL AND precio_adicional IS NULL)
                                          OR (cantidad_adicional > 0 AND precio_adicional > 0))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_solexp_estado')
    CREATE INDEX IX_solexp_estado ON coe.express_solicitudes (estado, fecha_creacion);
GO

/* 4) Cobros generados al aprobar -------------------------------------------- */
IF OBJECT_ID('coe.express_cobros') IS NULL
CREATE TABLE coe.express_cobros (
    id                  INT            IDENTITY(1,1) NOT NULL,
    solicitud_id        INT            NOT NULL,
    cliente_id          INT            NOT NULL,
    contrato_id         INT            NOT NULL,
    concepto            NVARCHAR(20)   NOT NULL,         -- PLAN_ANUAL | ADICIONALES
    descripcion         NVARCHAR(500)  NOT NULL,
    cantidad            BIGINT         NOT NULL,
    valor_unitario      DECIMAL(18,4)  NOT NULL,
    subtotal            DECIMAL(18,2)  NOT NULL,         -- pesos enteros, como la factura
    iva                 DECIMAL(18,2)  NOT NULL,
    total               DECIMAL(18,2)  NOT NULL,
    rtefte              DECIMAL(18,2)  NOT NULL,
    rteiva              DECIMAL(18,2)  NOT NULL,
    rteica              DECIMAL(18,2)  NOT NULL,
    desglose            NVARCHAR(MAX)  NULL,
    estado              NVARCHAR(20)   NOT NULL CONSTRAINT DF_cobexp_estado DEFAULT 'por_facturar',
    fecha_creacion      DATETIME2(0)   NOT NULL CONSTRAINT DF_cobexp_fcrea DEFAULT SYSDATETIME(),
    CONSTRAINT PK_express_cobros  PRIMARY KEY (id),
    CONSTRAINT FK_cobexp_sol      FOREIGN KEY (solicitud_id) REFERENCES coe.express_solicitudes(id),
    CONSTRAINT FK_cobexp_cliente  FOREIGN KEY (cliente_id) REFERENCES coe.clientes(id),
    CONSTRAINT FK_cobexp_contrato FOREIGN KEY (contrato_id) REFERENCES coe.contratos(id),
    CONSTRAINT CK_cobexp_concepto CHECK (concepto IN ('PLAN_ANUAL','ADICIONALES')),
    CONSTRAINT CK_cobexp_estado   CHECK (estado IN ('por_facturar','facturado')),
    -- Una solicitud genera a lo sumo un cobro por concepto (aprobar dos veces no duplica)
    CONSTRAINT UQ_cobexp_sol_conc UNIQUE (solicitud_id, concepto)
);
GO

/* 5) Consumo mensual por suscripción (referencia frente al tope) ------------ */
IF OBJECT_ID('coe.express_consumos') IS NULL
CREATE TABLE coe.express_consumos (
    id                  INT            IDENTITY(1,1) NOT NULL,
    contrato_item_id    INT            NOT NULL,
    anio                SMALLINT       NOT NULL,
    mes                 TINYINT        NOT NULL,
    cantidad            BIGINT         NOT NULL,
    fecha_creacion      DATETIME2(0)   NOT NULL CONSTRAINT DF_consexp_fcrea DEFAULT SYSDATETIME(),
    CONSTRAINT PK_express_consumos PRIMARY KEY (id),
    CONSTRAINT FK_consexp_item     FOREIGN KEY (contrato_item_id) REFERENCES coe.contrato_items(id) ON DELETE CASCADE,
    CONSTRAINT CK_consexp_mes      CHECK (mes BETWEEN 1 AND 12),
    CONSTRAINT UQ_consexp_periodo  UNIQUE (contrato_item_id, anio, mes)
);
GO
