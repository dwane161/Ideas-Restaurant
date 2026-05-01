# Ideas Restaurant — Despliegue multi‑cliente (multi‑tenant por subdominio)

## Resumen
Objetivo: desplegar la misma solución para **múltiples clientes** de forma sencilla y repetible.

Decisiones:
- **Un backend por cliente** (instancia aislada).
- **Una BD MSSQL por cliente** (ERP + tablas `App_*` dentro de la misma BD).
- **Acceso por subdominio** (ej. `https://cliente1.tudominio.com`).
- **Hosting en VPS** (recomendado) con **Nginx + SSL**.
- **App web**: el frontend llama a **`/api` relativo** (mismo dominio) para evitar CORS/mixed-content y no depender de `apiBaseUrl` fijo.

---

## Arquitectura

### 1) DNS y routing por subdominio
Para cada cliente `tenant`:
- DNS: `A tenant.tudominio.com -> IP del VPS`.
- URLs:
  - `https://tenant.tudominio.com/` → frontend (SPA).
  - `https://tenant.tudominio.com/api/*` → backend del tenant.

### 2) Reverse proxy (Nginx)
Nginx se encarga de:
- Terminar TLS (Let’s Encrypt).
- Servir el build del frontend.
- Hacer proxy de `/api` al backend del tenant.

### 3) Backend por tenant (Node/Express + Prisma)
Cada tenant corre su propia instancia (idealmente Docker), con `.env` propio:
- `DATABASE_URL` apuntando a la MSSQL del tenant.
- `PORT` interno del container/proceso (solo local).

### 4) Datos por tenant
Cada tenant tiene su propia BD MSSQL.
En esa BD viven:
- Tablas del ERP (existentes).
- Tablas del app: `App_*` (órdenes, items, estados, settings, etc.).

---

## Configuración recomendada

### Frontend: usar `/api` relativo
Para multi‑cliente por subdominio, el frontend debe usar la API del mismo origen:
- `apiBaseUrl = "/api"` (sin host).

Esto permite:
- Sin CORS.
- Un solo build para todos los clientes.
- No depender de configuración manual por dispositivo.

### Backend: `DATABASE_URL` por instancia
Cada backend del tenant debe usar:
- `DATABASE_URL="sqlserver://HOST:1433;database=DB;user=USER;password=...;encrypt=true;trustServerCertificate=true"`

Notas:
- Evitar `jdbc:` (Prisma no usa JDBC).
- Si el password tiene `;` o `=`, debe ir URL‑encoded.

---

## Provisionamiento de un tenant nuevo (paso a paso)
Ejemplo: `tenant = clienteN`

### 1) BD (MSSQL del clienteN)
Ejecutar un script **idempotente** que:
- Cree tablas `App_*` si no existen.
- Aplique `ALTER TABLE` para columnas nuevas.
- Inserte seeds para catálogos (estados) **sin `MERGE`** (si tu BD no lo permite).

Recomendación: mantener un script “onboarding” que puedas re‑ejecutar sin romper nada.

### 2) DNS
- Crear `A clienteN.tudominio.com -> IP del VPS`.

### 3) VPS (deploy)
Crear una unidad desplegable por tenant:
- Carpeta (ej.): `/opt/ideas-restaurant/tenants/clienteN/`
- `.env` del backend con `DATABASE_URL` del clienteN
- `docker compose up -d` (o systemd/pm2 si no usas Docker)
- Config de Nginx para `clienteN.tudominio.com`
- SSL:
  - `certbot --nginx -d clienteN.tudominio.com`

### 4) Smoke test
- `GET https://clienteN.tudominio.com/api/health`
- `GET https://clienteN.tudominio.com/api/db/ping`
- Login con PIN
- Abrir mesa → agregar item → cancelar pending → pagar → cerrar/limpiar

---

## Operación y monitoreo
- Logs:
  - Nginx access/error por vhost.
  - Backend por tenant (stdout).
- Backups:
  - Cada tenant: respaldos de su MSSQL.
  - VPS: respaldos de configs (Nginx, compose, `.env`).
- Seguridad:
  - Forzar HTTPS en producción.
  - Rate-limit en Nginx para `/api/auth/login` (anti brute force PIN).

---

## Checklist de aceptación (multi‑cliente)
Con `clienteA` y `clienteB`:
- `clienteA` lee/escribe solo en la BD de A.
- `clienteB` lee/escribe solo en la BD de B.
- No hay CORS.
- Un solo build del frontend sirve para todos los tenants.

