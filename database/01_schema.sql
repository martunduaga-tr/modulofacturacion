/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   ETAPA 1 · Gestión de contratos y tarifas
   Esquema de base de datos — SQL Server (on-premise)
   ----------------------------------------------------------------------------
   Reemplaza las hojas `CONTRATOS COE` de todos los productos del portafolio.

   Jerarquía del dominio:
     PRODUCTO (iFactura, iSeguros, … ~34)
        └── CONCEPTO FACTURABLE (ej. emisión, recepción)
               └── CONTRATO_ITEM (contrato + producto + concepto)
                      └── TARIFA (escalonado / mínimo / fijo), versionada por AÑO

   Convenciones:
     - Esquema dedicado `coe` para namespacing en el SQL Server corporativo.
     - Montos y tarifas en DECIMAL exacto (nunca FLOAT) — la etapa 3 exige precisión.
     - Volúmenes en BIGINT (conteo de documentos/transacciones).
     - Estados y enums como NVARCHAR con CHECK (legibles para Contabilidad).
     - Toda escritura en tarifas/contratos/parámetros se registra en auditoria_cambios.
   ============================================================================ */

SET XACT_ABORT ON;
GO

/* --- Esquema --------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'coe')
    EXEC('CREATE SCHEMA coe');
GO

/* ============================================================================
   1. PRODUCTOS
   Los ~34 productos del portafolio (iFactura, iSeguros, iRecaudo, …).
   ============================================================================ */
CREATE TABLE coe.productos (
    id                  INT            IDENTITY(1,1) NOT NULL,
    codigo              NVARCHAR(50)   NOT NULL,   -- IFACTURA, ISEGUROS, IRECAUDO…
    nombre              NVARCHAR(150)  NOT NULL,
    estado              NVARCHAR(20)   NOT NULL CONSTRAINT DF_productos_estado DEFAULT 'activo',
    fecha_creacion      DATETIME2(0)   NOT NULL CONSTRAINT DF_productos_fcrea DEFAULT SYSDATETIME(),
    fecha_modificacion  DATETIME2(0)   NULL,
    CONSTRAINT PK_productos          PRIMARY KEY (id),
    CONSTRAINT UQ_productos_codigo   UNIQUE (codigo),
    CONSTRAINT CK_productos_estado   CHECK (estado IN ('activo','inactivo'))
);
GO

/* ============================================================================
   2. CONCEPTOS_FACTURABLES
   Un producto tiene N conceptos. Ej. iFactura → EMISION, RECEPCION.
   La restricción UNIQUE (id, producto_id) habilita la FK compuesta desde
   contrato_items, que garantiza que el concepto pertenezca a su producto.
   ============================================================================ */
CREATE TABLE coe.conceptos_facturables (
    id                  INT            IDENTITY(1,1) NOT NULL,
    producto_id         INT            NOT NULL,
    codigo              NVARCHAR(50)   NOT NULL,   -- EMISION, RECEPCION…
    nombre              NVARCHAR(150)  NOT NULL,
    estado              NVARCHAR(20)   NOT NULL CONSTRAINT DF_conceptos_estado DEFAULT 'activo',
    fecha_creacion      DATETIME2(0)   NOT NULL CONSTRAINT DF_conceptos_fcrea DEFAULT SYSDATETIME(),
    fecha_modificacion  DATETIME2(0)   NULL,
    CONSTRAINT PK_conceptos            PRIMARY KEY (id),
    CONSTRAINT FK_conceptos_producto   FOREIGN KEY (producto_id) REFERENCES coe.productos(id),
    CONSTRAINT UQ_conceptos_codigo     UNIQUE (producto_id, codigo),
    CONSTRAINT UQ_conceptos_id_prod    UNIQUE (id, producto_id),  -- para FK compuesta
    CONSTRAINT CK_conceptos_estado     CHECK (estado IN ('activo','inactivo'))
);
GO

/* ============================================================================
   3. CLIENTES
   Las ~700 empresas facturadas. Identificadas por NIT.
   ============================================================================ */
CREATE TABLE coe.clientes (
    id                  INT            IDENTITY(1,1) NOT NULL,
    nit                 NVARCHAR(20)   NOT NULL,
    razon_social        NVARCHAR(255)  NOT NULL,
    correo_contacto     NVARCHAR(255)  NULL,
    estado              NVARCHAR(20)   NOT NULL CONSTRAINT DF_clientes_estado DEFAULT 'activo',
    observaciones       NVARCHAR(MAX)  NULL,
    fecha_creacion      DATETIME2(0)   NOT NULL CONSTRAINT DF_clientes_fcrea DEFAULT SYSDATETIME(),
    fecha_modificacion  DATETIME2(0)   NULL,
    CONSTRAINT PK_clientes          PRIMARY KEY (id),
    CONSTRAINT UQ_clientes_nit      UNIQUE (nit),
    CONSTRAINT CK_clientes_estado   CHECK (estado IN ('activo','retirado'))
);
GO
CREATE INDEX IX_clientes_razon_social ON coe.clientes (razon_social);
GO

/* ============================================================================
   4. CONTRATOS
   Acuerdo con un cliente. Ej. "Otro Sí No.1 SG-001".
   ============================================================================ */
CREATE TABLE coe.contratos (
    id                  INT            IDENTITY(1,1) NOT NULL,
    cliente_id          INT            NOT NULL,
    nombre_contrato     NVARCHAR(255)  NOT NULL,
    vigencia_desde      DATE           NULL,
    vigencia_hasta      DATE           NULL,
    estado              NVARCHAR(20)   NOT NULL CONSTRAINT DF_contratos_estado DEFAULT 'activo',
    observaciones       NVARCHAR(MAX)  NULL,
    fecha_creacion      DATETIME2(0)   NOT NULL CONSTRAINT DF_contratos_fcrea DEFAULT SYSDATETIME(),
    fecha_modificacion  DATETIME2(0)   NULL,
    CONSTRAINT PK_contratos          PRIMARY KEY (id),
    CONSTRAINT FK_contratos_cliente  FOREIGN KEY (cliente_id) REFERENCES coe.clientes(id),
    CONSTRAINT CK_contratos_estado   CHECK (estado IN ('activo','inactivo')),
    CONSTRAINT CK_contratos_vigencia CHECK (vigencia_hasta IS NULL
                                            OR vigencia_desde IS NULL
                                            OR vigencia_desde <= vigencia_hasta)
);
GO
CREATE INDEX IX_contratos_cliente ON coe.contratos (cliente_id);
GO

/* ============================================================================
   5. CONTRATO_ITEMS  (tabla bisagra)
   Combinación contrato + producto + concepto. De aquí cuelgan las tarifas.
   La FK compuesta (concepto_id, producto_id) garantiza que el concepto
   pertenezca al producto del item.
   ============================================================================ */
CREATE TABLE coe.contrato_items (
    id                  INT            IDENTITY(1,1) NOT NULL,
    contrato_id         INT            NOT NULL,
    producto_id         INT            NOT NULL,
    concepto_id         INT            NOT NULL,
    modelo_cobro        NVARCHAR(30)   NOT NULL,   -- volumen_escalonado | minimo_garantizado | fijo_mensual
    estado              NVARCHAR(20)   NOT NULL CONSTRAINT DF_items_estado DEFAULT 'activo',
    fecha_creacion      DATETIME2(0)   NOT NULL CONSTRAINT DF_items_fcrea DEFAULT SYSDATETIME(),
    fecha_modificacion  DATETIME2(0)   NULL,
    CONSTRAINT PK_contrato_items        PRIMARY KEY (id),
    CONSTRAINT FK_items_contrato        FOREIGN KEY (contrato_id) REFERENCES coe.contratos(id) ON DELETE CASCADE,
    CONSTRAINT FK_items_concepto_prod   FOREIGN KEY (concepto_id, producto_id)
                                        REFERENCES coe.conceptos_facturables(id, producto_id),
    CONSTRAINT UQ_items_combinacion     UNIQUE (contrato_id, producto_id, concepto_id),
    CONSTRAINT CK_items_modelo          CHECK (modelo_cobro IN
                                            ('volumen_escalonado','minimo_garantizado','fijo_mensual')),
    CONSTRAINT CK_items_estado          CHECK (estado IN ('activo','inactivo'))
);
GO
CREATE INDEX IX_items_contrato ON coe.contrato_items (contrato_id);
GO

/* ============================================================================
   6. TARIFA_ESCALONES  (tabla central de tarifas)
   Modelo volumen_escalonado. Una fila se lee:
   "Para este item y año, los documentos entre volumen_desde y volumen_hasta
    se cobran a precio_unitario cada uno."

   REGLA DE NEGOCIO (no obvia): el escalón solo SELECCIONA la tarifa según el
   volumen total del mes; luego TODO el volumen se multiplica por esa tarifa.
   NO es suma de tramos acumulados.

   El no-solapamiento entre escalones del mismo item/año se valida en el
   servicio (no es expresable con un CHECK de fila). La UNIQUE evita duplicar
   el mismo punto de inicio de escalón.
   ============================================================================ */
CREATE TABLE coe.tarifa_escalones (
    id                  INT            IDENTITY(1,1) NOT NULL,
    contrato_item_id    INT            NOT NULL,
    anio                SMALLINT       NOT NULL,
    volumen_desde       BIGINT         NOT NULL,
    volumen_hasta       BIGINT         NOT NULL,
    precio_unitario     DECIMAL(18,4)  NOT NULL,
    ipc_aplicado        DECIMAL(9,6)   NULL,       -- metadato/referencia
    fecha_creacion      DATETIME2(0)   NOT NULL CONSTRAINT DF_escalones_fcrea DEFAULT SYSDATETIME(),
    fecha_modificacion  DATETIME2(0)   NULL,
    CONSTRAINT PK_tarifa_escalones      PRIMARY KEY (id),
    CONSTRAINT FK_escalones_item        FOREIGN KEY (contrato_item_id)
                                        REFERENCES coe.contrato_items(id) ON DELETE CASCADE,
    CONSTRAINT UQ_escalones_punto       UNIQUE (contrato_item_id, anio, volumen_desde),
    CONSTRAINT CK_escalones_rango       CHECK (volumen_desde <= volumen_hasta),
    CONSTRAINT CK_escalones_precio      CHECK (precio_unitario > 0),
    CONSTRAINT CK_escalones_anio        CHECK (anio BETWEEN 2000 AND 2100)
);
GO
CREATE INDEX IX_escalones_item_anio ON coe.tarifa_escalones (contrato_item_id, anio);
GO

/* ============================================================================
   7. MINIMO_GARANTIZADO
   Modelo minimo_garantizado. Piso por año: subtotal = max(volumen*tarifa, mínimo).
   ============================================================================ */
CREATE TABLE coe.minimo_garantizado (
    id                  INT            IDENTITY(1,1) NOT NULL,
    contrato_item_id    INT            NOT NULL,
    anio                SMALLINT       NOT NULL,
    valor_minimo        DECIMAL(18,4)  NOT NULL,
    fecha_creacion      DATETIME2(0)   NOT NULL CONSTRAINT DF_minimo_fcrea DEFAULT SYSDATETIME(),
    fecha_modificacion  DATETIME2(0)   NULL,
    CONSTRAINT PK_minimo_garantizado    PRIMARY KEY (id),
    CONSTRAINT FK_minimo_item           FOREIGN KEY (contrato_item_id)
                                        REFERENCES coe.contrato_items(id) ON DELETE CASCADE,
    CONSTRAINT UQ_minimo_item_anio      UNIQUE (contrato_item_id, anio),
    CONSTRAINT CK_minimo_valor          CHECK (valor_minimo > 0),
    CONSTRAINT CK_minimo_anio           CHECK (anio BETWEEN 2000 AND 2100)
);
GO

/* ============================================================================
   8. TARIFA_FIJA
   Modelo fijo_mensual. Monto fijo por año, independiente del volumen.
   ============================================================================ */
CREATE TABLE coe.tarifa_fija (
    id                  INT            IDENTITY(1,1) NOT NULL,
    contrato_item_id    INT            NOT NULL,
    anio                SMALLINT       NOT NULL,
    valor_fijo          DECIMAL(18,4)  NOT NULL,
    fecha_creacion      DATETIME2(0)   NOT NULL CONSTRAINT DF_fija_fcrea DEFAULT SYSDATETIME(),
    fecha_modificacion  DATETIME2(0)   NULL,
    CONSTRAINT PK_tarifa_fija           PRIMARY KEY (id),
    CONSTRAINT FK_fija_item             FOREIGN KEY (contrato_item_id)
                                        REFERENCES coe.contrato_items(id) ON DELETE CASCADE,
    CONSTRAINT UQ_fija_item_anio        UNIQUE (contrato_item_id, anio),
    CONSTRAINT CK_fija_valor            CHECK (valor_fijo > 0),
    CONSTRAINT CK_fija_anio             CHECK (anio BETWEEN 2000 AND 2100)
);
GO

/* ============================================================================
   9. PARAMETROS_GLOBALES
   Tasas tributarias y constantes (IVA, retenciones, IPC, TRM), versionadas
   por vigencia. valor en DECIMAL(18,6): cubre tanto tasas (0.19) como TRM.
   ============================================================================ */
CREATE TABLE coe.parametros_globales (
    id                  INT            IDENTITY(1,1) NOT NULL,
    clave               NVARCHAR(50)   NOT NULL,   -- IVA, RTEFTE, RTEICA, RTEIVA, AUTORRETENCION, IPC, TRM
    valor               DECIMAL(18,6)  NOT NULL,
    vigencia_desde      DATE           NOT NULL,
    descripcion         NVARCHAR(255)  NULL,
    fecha_creacion      DATETIME2(0)   NOT NULL CONSTRAINT DF_param_fcrea DEFAULT SYSDATETIME(),
    CONSTRAINT PK_parametros_globales   PRIMARY KEY (id),
    CONSTRAINT UQ_param_clave_vigencia  UNIQUE (clave, vigencia_desde)
);
GO

/* ============================================================================
   10. USUARIOS  (módulo auth — roles)
   Roles del PRD: administrador, editor (Contabilidad), lector.
   El hash de contraseña lo produce la app; aquí solo se almacena.
   ============================================================================ */
CREATE TABLE coe.usuarios (
    id                  INT            IDENTITY(1,1) NOT NULL,
    username            NVARCHAR(100)  NOT NULL,
    nombre              NVARCHAR(150)  NOT NULL,
    email               NVARCHAR(255)  NULL,
    password_hash       NVARCHAR(255)  NOT NULL,
    rol                 NVARCHAR(20)   NOT NULL,
    estado              NVARCHAR(20)   NOT NULL CONSTRAINT DF_usuarios_estado DEFAULT 'activo',
    fecha_creacion      DATETIME2(0)   NOT NULL CONSTRAINT DF_usuarios_fcrea DEFAULT SYSDATETIME(),
    CONSTRAINT PK_usuarios          PRIMARY KEY (id),
    CONSTRAINT UQ_usuarios_username UNIQUE (username),
    CONSTRAINT CK_usuarios_rol      CHECK (rol IN ('administrador','editor','lector')),
    CONSTRAINT CK_usuarios_estado   CHECK (estado IN ('activo','inactivo'))
);
GO

/* ============================================================================
   11. AUDITORIA_CAMBIOS
   Registro de toda escritura en tarifas/contratos/parámetros.
   usuario se almacena como texto (no FK): el log debe sobrevivir cambios o
   bajas del usuario. valor_anterior/nuevo en JSON (NVARCHAR(MAX)).
   ============================================================================ */
CREATE TABLE coe.auditoria_cambios (
    id                  BIGINT         IDENTITY(1,1) NOT NULL,
    tabla               NVARCHAR(100)  NOT NULL,
    registro_id         INT            NOT NULL,
    usuario             NVARCHAR(100)  NOT NULL,
    accion              NVARCHAR(20)   NOT NULL,   -- INSERT | UPDATE | DELETE
    valor_anterior      NVARCHAR(MAX)  NULL,       -- JSON
    valor_nuevo         NVARCHAR(MAX)  NULL,       -- JSON
    fecha               DATETIME2(0)   NOT NULL CONSTRAINT DF_auditoria_fecha DEFAULT SYSDATETIME(),
    CONSTRAINT PK_auditoria_cambios  PRIMARY KEY (id),
    CONSTRAINT CK_auditoria_accion   CHECK (accion IN ('INSERT','UPDATE','DELETE'))
);
GO
CREATE INDEX IX_auditoria_tabla_fecha ON coe.auditoria_cambios (tabla, fecha);
GO
