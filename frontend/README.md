# Frontend — Sistema de Facturación COE

UI React (Vite + TypeScript) para Contabilidad. Sistema de diseño en `../DESIGN.md`.

## Puesta en marcha

```powershell
cd frontend
npm install
copy .env.example .env   # opcional; por defecto apunta a http://localhost:3000/api
npm run dev
```

- App: http://localhost:5173
- Requiere el **backend** corriendo (http://localhost:3000) — ver `../backend/README.md`.
- Login inicial: `admin` / `Admin123*`.

## Stack

- React 19 + Vite + TypeScript.
- React Router (rutas), TanStack Query (datos/caché/paginación).
- Tokens de diseño en `src/styles/tokens.css` (OKLCH, ver `DESIGN.md`); clases reutilizables en `components.css`.
- Tipografías self-hosted (Figtree, IBM Plex Mono) vía `@fontsource` — sin CDN externo (apto on-premise).
- Auth JWT en `localStorage`; logout automático en 401.

## Estado de pantallas

| Pantalla | Estado |
|---|---|
| Login | ✅ |
| App shell (sidebar + topbar) | ✅ |
| Listado de contratos (RF-1) — buscar/filtrar/paginar | ✅ |
| Ficha de contrato (RF-2) — items, escalones, mínimo, fijo, selector de año | ✅ |
| Formularios crear/editar (RF-3/4/5) | ⏳ pendiente |
| Productos, Parámetros, Auditoría, Usuarios | ⏳ pendiente (placeholders) |
