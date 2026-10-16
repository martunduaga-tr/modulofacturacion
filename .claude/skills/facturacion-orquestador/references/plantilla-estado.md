# ESTADO DEL PROYECTO — Sistema de Facturación Automatizada (COE)

> Fuente de verdad del avance. Orquestador y planificador lo leen y actualizan cada sesión.
> Última actualización: AAAA-MM-DD por [quién]

## Etapa actual
**Etapa 1 — Gestión de contratos y tarifas (CRUD).** Objetivo: sacar las tarifas del Excel a una app web sobre SQL Server, editable por Contabilidad.

## Resumen de una línea
[Ej: "Modelo de datos definido; arrancando el backend NestJS."]

---

## Tablero

### Hecho
- [ ] (mover aquí lo completado, con fecha)

### En curso
- [ ] (lo que se está construyendo ahora, con responsable si aplica)

### Pendiente (Etapa 1)
- [ ] DDL de SQL Server (tablas de productos, conceptos, clientes, contratos, items, tarifas, parámetros, auditoría)
- [ ] Backend NestJS: módulos productos, clientes, contratos, tarifas, parametros, auditoria, auth
- [ ] Script de migración del Excel de iFactura + reporte
- [ ] Frontend: alta de productos/conceptos, listado, ficha, formulario con editor de escalones
- [ ] Autenticación por roles
- [ ] Verificación: tarifas migradas reproducen valores del Excel

### Backlog (Etapas 2-4, no tocar aún salvo preparación)
- [ ] Etapa 2: digitalización de la matriz de facturación
- [ ] Etapa 3: ingesta de volúmenes + motor de cálculo + validación IA + dashboard
- [ ] Etapa 4: emisión iFactura API + SIIGO + idempotencia

---

## Decisiones tomadas
- Precio efectivo por año se ALMACENA (no se recalcula desde IPC), para auditabilidad.
- Cálculo escalonado NO es por tramos: el escalón selecciona la tarifa, se multiplica todo el volumen por ella.
- Producto es dimensión de primer nivel; tarifas cuelgan de contrato_item (contrato+producto+concepto).
- Cálculo determinístico, aprobación humana obligatoria, trazabilidad completa.

## Bloqueos / esperando decisión
- [ ] Formato de los Excel de los otros ~33 productos.
- [ ] Base exacta de cada retención.
- [ ] ¿Algún producto con +2 conceptos?
- [ ] ¿iFactura tiene API de emisión?
- [ ] Facturación de clientes sin bloque propio en COE.

## Próxima sesión: empezar por
[Lo primero que se debe atacar la próxima vez.]
