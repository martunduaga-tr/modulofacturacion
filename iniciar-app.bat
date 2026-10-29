@echo off
rem Enciende la app de Facturacion COE en este equipo: base de datos (Docker),
rem backend (puerto 3000) y pantallas (puerto 5173). Cada servidor abre su propia
rem ventana; para apagarlos basta con cerrar esas ventanas.

echo Encendiendo la base de datos...
docker start sqlserver-coe >nul
if errorlevel 1 (
  echo No se pudo encender la base de datos. Abra Docker Desktop y vuelva a intentarlo.
  pause
  exit /b 1
)

start "COE - Backend (no cerrar)" cmd /k "cd /d %~dp0backend && npm run build && node dist/main"
start "COE - Pantallas (no cerrar)" cmd /k "cd /d %~dp0frontend && set PORT=5173&& npx vite"

echo Esperando a que el backend arranque...
timeout /t 45 /nobreak >nul
start "" http://localhost:5173
