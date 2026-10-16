/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   Incremental · modelo BOLSA + recargo fijo + franquicia del mínimo garantizado
   ----------------------------------------------------------------------------
   Contabilidad confirmó 3 reglas de negocio nuevas (ver
   CASOS_BORDE_MODELO_FACTURACION.md, secciones A1 / B1 / B2):

   1) MÍNIMO GARANTIZADO es una franquicia, no un piso tipo max(). Cubre las
      primeras N unidades (volumen_tope) por un monto plano; el excedente se
      cobra a la tarifa del escalón donde cae el volumen TOTAL del mes. Antes
      el motor calculaba max(volumen*tarifa, mínimo) — se corrige agregando
      volumen_tope.

   2) BOLSA es un 4° modelo de cobro: se paga el monto plano de la banda en la
      que cae el volumen total del mes, sin multiplicar por unidades.
      Reutiliza coe.tarifa_escalones (mismo shape desde/hasta/precio); solo
      cambia cómo lo interpreta el motor de cálculo.

   3) Un item puede tener, además de su modelo de cobro, uno o más RECARGOS
      FIJOS mensuales que se suman siempre al subtotal, sin importar el
      volumen (ej. "MANTENIMIENTO" de SAN CARLOS).

   Este script se aplica sobre una BD que YA tiene 01-06 (ver apply-schema.js:
   tiene su propio gate, independiente del centinela de coe.productos).
   ============================================================================ */

/* 1) Franquicia del mínimo garantizado: tope de la banda que cubre el monto
   plano. Nullable (como el DV en 06_clientes_dv.sql): no rompe filas ya
   cargadas con la interpretación anterior; el motor exige el dato al calcular
   (ErrorCalculo SIN_TOPE_MINIMO) en vez de fallar la migración del esquema. */
ALTER TABLE coe.minimo_garantizado ADD volumen_tope BIGINT NULL;
GO
ALTER TABLE coe.minimo_garantizado ADD CONSTRAINT CK_minimo_tope
    CHECK (volumen_tope IS NULL OR volumen_tope > 0);
GO

/* 2) Nuevo modelo de cobro BOLSA. */
ALTER TABLE coe.contrato_items DROP CONSTRAINT CK_items_modelo;
GO
ALTER TABLE coe.contrato_items ADD CONSTRAINT CK_items_modelo CHECK (modelo_cobro IN
    ('volumen_escalonado','minimo_garantizado','fijo_mensual','bolsa'));
GO

/* 3) Recargo fijo mensual: aditivo, independiente del modelo_cobro del item. */
CREATE TABLE coe.recargo_fijo (
    id                  INT            IDENTITY(1,1) NOT NULL,
    contrato_item_id    INT            NOT NULL,
    anio                SMALLINT       NOT NULL,
    concepto            NVARCHAR(50)   NOT NULL,   -- ej. 'MANTENIMIENTO'
    valor               DECIMAL(18,4)  NOT NULL,
    fecha_creacion      DATETIME2(0)   NOT NULL CONSTRAINT DF_recargo_fcrea DEFAULT SYSDATETIME(),
    fecha_modificacion  DATETIME2(0)   NULL,
    CONSTRAINT PK_recargo_fijo            PRIMARY KEY (id),
    CONSTRAINT FK_recargo_item            FOREIGN KEY (contrato_item_id)
                                          REFERENCES coe.contrato_items(id) ON DELETE CASCADE,
    CONSTRAINT UQ_recargo_item_anio_conc  UNIQUE (contrato_item_id, anio, concepto),
    CONSTRAINT CK_recargo_valor           CHECK (valor > 0),
    CONSTRAINT CK_recargo_anio            CHECK (anio BETWEEN 2000 AND 2100)
);
GO
CREATE INDEX IX_recargo_item_anio ON coe.recargo_fijo (contrato_item_id, anio);
GO

/* 4) pre_liquidados: exponer el recargo fijo aplicado como columna propia
   (igual que tarifa_unitaria/subtotal), no solo dentro del JSON `desglose`,
   para que el desglose en pantalla no dependa de parsear JSON. */
ALTER TABLE coe.pre_liquidados ADD recargo_fijo DECIMAL(18,2) NOT NULL
    CONSTRAINT DF_preliquidados_recargo DEFAULT 0;
GO

