/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   ETAPA 3.5 · Contratos híbridos
   ----------------------------------------------------------------------------
   Contabilidad reporta que un contrato_item puede agrupar VARIOS producto+
   concepto (ej. iFactura Emisión + Recepción combinados bajo una sola tabla
   de tarifa, o incluso servicios de productos distintos). El volumen que
   compara contra esa tabla es la SUMA de todos los servicios agrupados.

   Antes: contrato_items.producto_id/concepto_id (1 solo par por item).
   Ahora: coe.contrato_item_conceptos (N pares por item). Un item "normal"
   (el caso de hoy, ~100 contratos) simplemente tiene 1 fila aquí.

   Este script se aplica sobre una BD que YA tiene 01-04 (ver apply-schema.js:
   tiene su propio gate, independiente del centinela de coe.productos).
   ============================================================================ */

SET XACT_ABORT ON;
GO

CREATE TABLE coe.contrato_item_conceptos (
    id                  INT            IDENTITY(1,1) NOT NULL,
    contrato_item_id    INT            NOT NULL,
    producto_id         INT            NOT NULL,
    concepto_id         INT            NOT NULL,
    fecha_creacion      DATETIME2(0)   NOT NULL CONSTRAINT DF_item_conceptos_fcrea DEFAULT SYSDATETIME(),
    CONSTRAINT PK_contrato_item_conceptos PRIMARY KEY (id),
    CONSTRAINT FK_itemconcepto_item       FOREIGN KEY (contrato_item_id)
                                          REFERENCES coe.contrato_items(id) ON DELETE CASCADE,
    CONSTRAINT FK_itemconcepto_prod       FOREIGN KEY (concepto_id, producto_id)
                                          REFERENCES coe.conceptos_facturables(id, producto_id),
    CONSTRAINT UQ_itemconcepto_par        UNIQUE (contrato_item_id, producto_id, concepto_id)
);
GO
CREATE INDEX IX_itemconceptos_item ON coe.contrato_item_conceptos (contrato_item_id);
GO
CREATE INDEX IX_itemconceptos_prodconc ON coe.contrato_item_conceptos (producto_id, concepto_id);
GO

/* Backfill: cada item existente tenía exactamente 1 par -> 1 fila aquí. */
INSERT INTO coe.contrato_item_conceptos (contrato_item_id, producto_id, concepto_id)
SELECT id, producto_id, concepto_id FROM coe.contrato_items;
GO

/* Ya migrado a la tabla puente: eliminar las columnas y sus constraints. */
ALTER TABLE coe.contrato_items DROP CONSTRAINT FK_items_concepto_prod;
GO
ALTER TABLE coe.contrato_items DROP CONSTRAINT UQ_items_combinacion;
GO
ALTER TABLE coe.contrato_items DROP COLUMN producto_id, concepto_id;
GO

/* pre_liquidados: un item hibrido (2+ conceptos) no tiene UN producto/concepto
   -> null. El desglose por servicio queda en el JSON `desglose` (columna ya
   existente: volumenesOrigen). No tienen FK propia (ver 04_calculo.sql), solo
   se relaja el NOT NULL. */
ALTER TABLE coe.pre_liquidados ALTER COLUMN producto_id INT NULL;
GO
ALTER TABLE coe.pre_liquidados ALTER COLUMN concepto_id INT NULL;
GO
