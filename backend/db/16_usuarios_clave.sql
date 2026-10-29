/* ============================================================================
   Sistema de Facturación Automatizada (COE) — Transfiriendo S.A.
   Incremental · clave temporal con cambio obligatorio (2026-10-29)
   ----------------------------------------------------------------------------
   - El administrador crea el usuario (o restablece su clave) con una clave
     TEMPORAL: debe_cambiar_clave = 1 y la app no deja hacer nada más hasta que
     el usuario ponga la suya. Así nadie más conoce la clave definitiva y la
     auditoría a su nombre es suya.
   - Un usuario que se va de la empresa se DESACTIVA (estado = 'inactivo'): no
     se borra, para que su historial en auditoría siga teniendo dueño.
   ============================================================================ */
IF COL_LENGTH('coe.usuarios', 'debe_cambiar_clave') IS NULL
    ALTER TABLE coe.usuarios ADD debe_cambiar_clave BIT NOT NULL
        CONSTRAINT DF_usuarios_debe_cambiar_clave DEFAULT 0;
