/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   Incremental · comentario de la línea de factura por cliente (2026-10-27)
   ----------------------------------------------------------------------------
   - La línea de factura se arma como "<clasificador> - <comentario>":
     el clasificador es el término acordado con Contabilidad (Emisión,
     Recepción, Emisión - Recepción) y el comentario es el texto propio del
     cliente que hoy viaja en la descripción de sus facturas.
   - Un comentario por cliente y clasificador. Se precarga desde el historial
     de facturas (DATA TRANSFIRIENDO 2026, scripts/precargar-comentarios.ts) y
     Contabilidad lo edita en la ficha del cliente; cada cambio queda en
     coe.auditoria_cambios. Solo es texto: no entra en ningún cálculo.

   (14_subservicios_hojas.sql amplía el clasificador a las 10 hojas de negocio.)

   Se aplica sobre una BD que YA tiene 01-12. Centinela: coe.cliente_comentarios_factura.
   ============================================================================ */

SET XACT_ABORT ON;
GO

IF OBJECT_ID('coe.cliente_comentarios_factura') IS NULL
CREATE TABLE coe.cliente_comentarios_factura (
    id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_cliente_comentarios_factura PRIMARY KEY,
    cliente_id          INT            NOT NULL CONSTRAINT FK_comentarios_factura_cliente REFERENCES coe.clientes(id),
    clasificador        NVARCHAR(30)   NOT NULL,
    comentario          NVARCHAR(500)  NOT NULL,
    origen              NVARCHAR(20)   NOT NULL CONSTRAINT DF_comentarios_factura_origen DEFAULT 'manual', -- historial | manual
    fecha_creacion      DATETIME2      NOT NULL CONSTRAINT DF_comentarios_factura_creacion DEFAULT SYSDATETIME(),
    fecha_modificacion  DATETIME2      NULL,
    CONSTRAINT UQ_comentarios_factura UNIQUE (cliente_id, clasificador),
    CONSTRAINT CK_comentarios_factura_clasificador CHECK (clasificador IN (N'Emisión', N'Recepción', N'Emisión - Recepción')),
    CONSTRAINT CK_comentarios_factura_origen CHECK (origen IN ('historial', 'manual'))
);
GO
