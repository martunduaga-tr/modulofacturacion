/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   Incremental · contratos de grupo (2026-10-30)
   ----------------------------------------------------------------------------
   - Grupo Ospedale: 12 NIT con mínimo mensual y tope propios + una bolsa común
     mensual (umbral). Lo que el grupo pasa del umbral se valora por tramos y se
     cobra a los NIT que superaron su propio tope. El periodo es SIEMPRE mensual.
   - Cada NIT conserva su contrato (item minimo_garantizado: valor y tope). El
     grupo solo agrega el umbral, los tramos del exceso y la lista de miembros.

   Se aplica sobre una BD que YA tiene 01-16. El centinela es coe.grupo_tarifa_contratos.
   ============================================================================ */

SET XACT_ABORT ON;
GO

IF OBJECT_ID('coe.grupos_tarifa') IS NULL
CREATE TABLE coe.grupos_tarifa (
    id              INT            IDENTITY(1,1) NOT NULL,
    codigo          NVARCHAR(100)  NOT NULL,
    nombre          NVARCHAR(255)  NOT NULL,
    umbral_mensual  BIGINT         NOT NULL,
    estado          NVARCHAR(20)   NOT NULL CONSTRAINT DF_grupos_estado DEFAULT 'activo',
    fecha_creacion  DATETIME2(0)   NOT NULL CONSTRAINT DF_grupos_fcrea DEFAULT SYSDATETIME(),
    CONSTRAINT PK_grupos_tarifa PRIMARY KEY (id),
    CONSTRAINT UQ_grupos_codigo UNIQUE (codigo),
    CONSTRAINT CK_grupos_umbral CHECK (umbral_mensual > 0),
    CONSTRAINT CK_grupos_estado CHECK (estado IN ('activo','inactivo'))
);
GO

IF OBJECT_ID('coe.grupo_tarifa_escalones') IS NULL
CREATE TABLE coe.grupo_tarifa_escalones (
    id               INT            IDENTITY(1,1) NOT NULL,
    grupo_id         INT            NOT NULL,
    anio             SMALLINT       NOT NULL,
    volumen_desde    BIGINT         NOT NULL,
    volumen_hasta    BIGINT         NOT NULL,
    precio_unitario  DECIMAL(18,4)  NOT NULL,
    CONSTRAINT PK_grupo_escalones PRIMARY KEY (id),
    CONSTRAINT FK_grupo_escalones_grupo FOREIGN KEY (grupo_id) REFERENCES coe.grupos_tarifa(id) ON DELETE CASCADE,
    CONSTRAINT UQ_grupo_escalones_punto UNIQUE (grupo_id, anio, volumen_desde),
    CONSTRAINT CK_grupo_escalones_rango CHECK (volumen_desde <= volumen_hasta),
    CONSTRAINT CK_grupo_escalones_precio CHECK (precio_unitario > 0)
);
GO

/* Centinela: va al final */
IF OBJECT_ID('coe.grupo_tarifa_contratos') IS NULL
CREATE TABLE coe.grupo_tarifa_contratos (
    grupo_id     INT NOT NULL,
    contrato_id  INT NOT NULL,
    CONSTRAINT PK_grupo_contratos PRIMARY KEY (grupo_id, contrato_id),
    CONSTRAINT UQ_grupo_contratos_contrato UNIQUE (contrato_id),
    CONSTRAINT FK_grupo_contratos_grupo FOREIGN KEY (grupo_id) REFERENCES coe.grupos_tarifa(id) ON DELETE CASCADE,
    CONSTRAINT FK_grupo_contratos_contrato FOREIGN KEY (contrato_id) REFERENCES coe.contratos(id) ON DELETE CASCADE
);
GO
