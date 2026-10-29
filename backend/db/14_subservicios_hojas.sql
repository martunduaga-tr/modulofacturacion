/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   Incremental · subservicios de Data + comentario por hoja (2026-10-27)
   ----------------------------------------------------------------------------
   1) Subservicios en el catálogo. Data trae un tercer nivel (SubServicio) que
      el empalme ahora lee: la llave es "Servicio/SubServicio" (ej.
      "iDocumentos/ANI"). Un contrato puede tarifar el subservicio aparte; si
      no lo hace, ese volumen va al item del servicio completo. Se siembran los
      de iDocumentos e iSeguros (los que se facturan en líneas distintas).
      Hrs_Dev (iSoat - Emision) no es transacción: el empalme lo descarta.
   2) El comentario de la línea de factura pasa de 3 términos a las 10 hojas
      de negocio: Emisión, Recepción, Emisión - Recepción (tarifa conjunta),
      Nómina, Doc Soporte, iDocumentos, ISALUD, iSoat, iSeguros, iRecaudo.
      En iSoat, iSeguros e iRecaudo hay un comentario por hoja, compartido por
      sus servicios.

   Se aplica sobre una BD que YA tiene 01-13. Centinela: coe.CK_comentarios_factura_hoja.
   ============================================================================ */

SET XACT_ABORT ON;
GO

/* 1) Subservicios ------------------------------------------------------------ */
MERGE coe.conceptos_facturables AS dst
USING (
    SELECT p.id AS producto_id, s.codigo, s.nombre, s.codigo_data
    FROM (VALUES
        ('IDOCUMENTOS', 'ANI',                    N'iDocumentos · ANI',                    N'iDocumentos/ANI'),
        ('IDOCUMENTOS', 'CUESTIONARIO_RETO',      N'iDocumentos · Cuestionario reto',      N'iDocumentos/CuestionarioReto'),
        ('IDOCUMENTOS', 'FIRMA_ELECTRONICA',      N'iDocumentos · Firma electrónica',      N'iDocumentos/FirmaElectrónica'),
        ('IDOCUMENTOS', 'OTP_EMAIL',              N'iDocumentos · OTP correo',             N'iDocumentos/OTP_Email'),
        ('IDOCUMENTOS', 'OTP_SMS',                N'iDocumentos · OTP SMS',                N'iDocumentos/OTP_SMS'),
        ('ISEGUROS',    'COTIZADORES_AUTOS_CAP',  N'Cotizadores · Autos, CAP y generales', N'iSeguros - Cotizadores/Autos_Cap_Generales'),
        ('ISEGUROS',    'COTIZADORES_VIDA',       N'Cotizadores · Vida',                   N'iSeguros - Cotizadores/Vida'),
        ('ISEGUROS',    'EMISION_CUMPLIMIENTO',   N'Emisión · Cumplimiento',               N'iSeguros - Emisión/Cumplimiento'),
        ('ISEGUROS',    'EMISION_AP',             N'Emisión · Accidentes personales',      N'iSeguros - Emisión/AP'),
        ('ISEGUROS',    'EMISION_ESTATAL_RC_TR',  N'Emisión · Estatal, particular, RC y todo riesgo', N'iSeguros - Emisión/EstatalParticularRCTodoRiesgo')
    ) AS s (producto, codigo, nombre, codigo_data)
    JOIN coe.productos p ON p.codigo = s.producto
) AS src
    ON dst.producto_id = src.producto_id AND dst.codigo = src.codigo
WHEN NOT MATCHED THEN
    INSERT (producto_id, codigo, nombre, codigo_data)
    VALUES (src.producto_id, src.codigo, src.nombre, src.codigo_data);
GO

/* 2) Comentario por hoja ------------------------------------------------------ */
IF OBJECT_ID('coe.CK_comentarios_factura_clasificador') IS NOT NULL
    ALTER TABLE coe.cliente_comentarios_factura DROP CONSTRAINT CK_comentarios_factura_clasificador;
GO
IF OBJECT_ID('coe.CK_comentarios_factura_hoja') IS NULL
    ALTER TABLE coe.cliente_comentarios_factura ADD CONSTRAINT CK_comentarios_factura_hoja CHECK (clasificador IN (
        N'Emisión', N'Recepción', N'Emisión - Recepción', N'Nómina', N'Doc Soporte',
        N'iDocumentos', N'ISALUD', N'iSoat', N'iSeguros', N'iRecaudo'));
GO
