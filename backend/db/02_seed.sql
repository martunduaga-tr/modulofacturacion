/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   Semilla inicial — SQL Server
   ----------------------------------------------------------------------------
   Carga SOLO datos de catálogo documentados con certeza en el PRD:
     - Parámetros tributarios vigentes (hoja PARAMETROS).
     - Producto iFactura y sus dos conceptos (emisión, recepción).

   NO se siembran los otros ~33 productos: su lista real y sus conceptos deben
   confirmarse con Contabilidad antes de cargarlos (RF-7).
   NO se siembran usuarios: el hash de contraseña lo genera la app.
   Idempotente: puede correrse varias veces sin duplicar.
   ============================================================================ */

SET XACT_ABORT ON;
GO

/* --- Parámetros tributarios -------------------------------------------------
   Tasas como fracción (0.19 = 19%). Vigencia desde 2026-01-01.
   RteFte se siembra en 3,5%; existe variante de 4% según cliente (parametrizar
   la base/tasa por contrato en etapas siguientes). TRM es configurable: se deja
   un valor de arranque que Contabilidad debe actualizar.
   ---------------------------------------------------------------------------- */
MERGE coe.parametros_globales AS dst
USING (VALUES
    ('IVA',            CAST(0.190000 AS DECIMAL(18,6)), CAST('2026-01-01' AS DATE), N'IVA general 19%'),
    ('AUTORRETENCION', CAST(0.008000 AS DECIMAL(18,6)), CAST('2026-01-01' AS DATE), N'Autorretención 0,8% (informativa)'),
    ('RTEFTE',         CAST(0.035000 AS DECIMAL(18,6)), CAST('2026-01-01' AS DATE), N'Retención en la fuente 3,5% (variante 4% según cliente)'),
    ('RTEIVA',         CAST(0.150000 AS DECIMAL(18,6)), CAST('2026-01-01' AS DATE), N'Retención de IVA 15% (sobre el IVA)'),
    ('RTEICA',         CAST(0.009660 AS DECIMAL(18,6)), CAST('2026-01-01' AS DATE), N'Retención de ICA 0,966%'),
    ('IPC',            CAST(0.052000 AS DECIMAL(18,6)), CAST('2026-01-01' AS DATE), N'IPC vigente 5,2%'),
    ('TRM',            CAST(0.000000 AS DECIMAL(18,6)), CAST('2026-01-01' AS DATE), N'TRM — actualizar con valor vigente')
) AS src (clave, valor, vigencia_desde, descripcion)
    ON dst.clave = src.clave AND dst.vigencia_desde = src.vigencia_desde
WHEN NOT MATCHED THEN
    INSERT (clave, valor, vigencia_desde, descripcion)
    VALUES (src.clave, src.valor, src.vigencia_desde, src.descripcion);
GO

/* --- Producto iFactura ------------------------------------------------------ */
MERGE coe.productos AS dst
USING (VALUES ('IFACTURA', N'iFactura')) AS src (codigo, nombre)
    ON dst.codigo = src.codigo
WHEN NOT MATCHED THEN
    INSERT (codigo, nombre) VALUES (src.codigo, src.nombre);
GO

/* --- Conceptos de iFactura: emisión, recepción ------------------------------ */
DECLARE @ifactura_id INT = (SELECT id FROM coe.productos WHERE codigo = 'IFACTURA');

MERGE coe.conceptos_facturables AS dst
USING (VALUES
    (@ifactura_id, 'EMISION',   N'Emisión'),
    (@ifactura_id, 'RECEPCION', N'Recepción')
) AS src (producto_id, codigo, nombre)
    ON dst.producto_id = src.producto_id AND dst.codigo = src.codigo
WHEN NOT MATCHED THEN
    INSERT (producto_id, codigo, nombre)
    VALUES (src.producto_id, src.codigo, src.nombre);
GO
