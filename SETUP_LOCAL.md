# Puesta en marcha en un equipo nuevo

Guía para levantar backend + frontend + base de datos del Sistema de Facturación COE.

## 0. Requisitos

| Herramienta | Estado en el equipo de cflorez (2026-07-14) |
|---|---|
| Node ≥ 20 | ✅ v26.2.0 |
| Python ≥ 3.10 + `openpyxl` | ✅ 3.14.5, openpyxl instalado |
| Docker Desktop | ⚠️ instalado, **no arranca: falta WSL2** |
| Excel fuente de tarifas | ❌ no está en el repo (excluido por `.gitignore`) |

---

## 1. Habilitar WSL2 (requiere ADMINISTRADOR — tarea de IT)

Docker Desktop en Windows necesita WSL2 y en este equipo no está instalado. En una
PowerShell **como administrador**:

```powershell
wsl --install --no-distribution
```

Reiniciar el equipo. Al volver, abrir Docker Desktop y verificar:

```powershell
docker info
```

> Alternativa sin WSL: instalar SQL Server Express nativo (también requiere admin) y
> apuntar `backend/.env` a esa instancia. En ese caso los pasos 2 y 3 se reemplazan por
> crear la BD `facturacion_coe` en esa instancia.

---

## 2. Levantar SQL Server (contenedor)

```powershell
docker run -d --name sqlserver-coe `
  -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=Coe_Dev_2026*" -e "MSSQL_PID=Developer" `
  -p 1433:1433 mcr.microsoft.com/mssql/server:2022-latest
```

Ojo con el puerto 1433: si otro proyecto lo tiene tomado (ej. `alertamiento-sql`), parar
ese contenedor o publicar este en otro puerto y ajustar `DB_PORT` en `backend/.env`.

---

## 3. Crear la BD y aplicar el esquema

`sqlcmd` viene dentro del contenedor. Desde la raíz del proyecto:

```powershell
$sql = "/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'Coe_Dev_2026*' -C"

docker exec sqlserver-coe bash -c "$sql -Q `"CREATE DATABASE facturacion_coe`""

# Copiar los scripts al contenedor y ejecutarlos EN ORDEN
docker cp database sqlserver-coe:/tmp/database
docker exec sqlserver-coe bash -c "$sql -d facturacion_coe -i /tmp/database/01_schema.sql"
docker exec sqlserver-coe bash -c "$sql -d facturacion_coe -f 65001 -i /tmp/database/02_seed.sql"
docker exec sqlserver-coe bash -c "$sql -d facturacion_coe -i /tmp/database/03_lineas_facturacion.sql"
docker exec sqlserver-coe bash -c "$sql -d facturacion_coe -i /tmp/database/04_calculo.sql"
```

> **`-f 65001` es obligatorio en la semilla**: sin ese codepage UTF-8, sqlcmd corrompe los
> acentos (Emisión, Recepción, Retención) y quedan como mojibake en la BD.

---

## 4. Backend

`backend/.env` ya está creado (no se versiona). Apunta a `localhost:1433`, BD
`facturacion_coe`, usuario `sa`. Si la BD queda en otro host/puerto, ajustarlo ahí.

```powershell
cd backend
npm install          # ya hecho
npm run build
node dist/main.js     # → http://localhost:3000/api   (login: admin / Admin123*)
```

El admin se siembra en el primer arranque con la clave de `ADMIN_PASSWORD`.

## 5. Frontend

`frontend/.env` ya está creado con `VITE_API_URL=http://localhost:3000/api`.

```powershell
cd frontend
npm install          # ya hecho
npm run dev          # → http://localhost:5173
```

Si el 5173 está ocupado, levantar con `npm run dev -- --port 5180` y añadir ese origen a
`CORS_ORIGIN` en `backend/.env`.

---

## 6. Cargar los datos (migración)

Requiere el Excel fuente en la **raíz del proyecto**, con este nombre exacto:

```
MATRIZ DE FACTURACION ENERO 26 FACTURA EMISION Y RECEPCION 2 (1).xlsx
```

Contiene tarifas y NITs de clientes → está excluido por `.gitignore`, **no se versiona**.
Con el backend arriba, en orden (los cargadores son idempotentes):

```powershell
python migration/parse_contratos_coe.py   # dry-run: genera reporte + bloques_parseados.json
python migration/cargar_contratos.py      # contratos y tarifas (Etapa 1)
python migration/cargar_matriz.py         # maestro de facturación (Etapa 2)
python migration/cargar_volumenes.py      # volúmenes (Etapa 3)
```

Revisar `migration/reporte_migracion.txt` **antes** de correr el cargador: ahí salen los
bloques que requieren revisión manual.
