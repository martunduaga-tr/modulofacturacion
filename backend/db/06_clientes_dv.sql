/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   Incremental · dígito de verificación (DV) del NIT en clientes
   ----------------------------------------------------------------------------
   El listado de clientes de facturación (DATACLIENTESFACTURA.xlsx) trae el DV
   del NIT junto al NIT. La tabla clientes no lo modelaba (01_schema.sql solo
   tenía nit); se agrega para no perder ese dato, relevante para facturación
   electrónica DIAN.

   Este script se aplica sobre una BD que YA tiene 01-05 (ver apply-schema.js:
   tiene su propio gate, independiente del centinela de coe.productos).
   ============================================================================ */

ALTER TABLE coe.clientes ADD dv NVARCHAR(2) NULL;
GO
