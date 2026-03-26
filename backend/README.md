# Backend (API)

Backend encapsulado en `backend/` (Node.js + Express + Prisma).

## Setup

1) Instala dependencias:

```bash
cd backend
npm install
```

2) Crea tu `.env` desde el ejemplo:

```bash
cp .env.example .env
```

3) Configura `DATABASE_URL` para MSSQL:

- Debe iniciar con `sqlserver://` (no `jdbc:sqlserver://`).
- Si tu `password` tiene `;` o `=`, URL-encode (por ejemplo `;` => `%3B`).

4) Con una BD ya existente en host (recomendado):

```bash
# Si tu BD ya existe (host), normalmente necesitas introspección:
npm run db:pull
npm run generate
```

## Crear tablas nuevas en SQL Server (hosting)

Muchos hostings de MSSQL no permiten `CREATE DATABASE` (Prisma lo necesita para el *shadow database* cuando usas `prisma migrate dev`), por eso aparece `P3014`.

Opciones:

1) **Crear tablas sin migraciones (rápido):**

```bash
npm run db:push
```

2) **Generar script SQL y ejecutarlo en el panel del hosting:**

```bash
npm run db:diff > migration.sql
```

> Luego ejecuta `migration.sql` en tu SQL Server (Query editor/SSMS).

Si `db:diff` te sale vacío pero sabes que las tablas no existen, genera el script desde cero:

```bash
npm run db:diff:empty > migration.sql
```

4) Levanta el API:

```bash
npm run dev
```

## Endpoints

- `GET /api/health`
- `GET /api/db/ping`
- `GET /api/db/time`
- `GET /api/articulos` (categorías, tabla `Aux_CArticulos`)
- `GET /api/productos?cat=CA_ID&take=50&skip=0&status=true&q=texto` (tabla `Maint_Inventario`, filtra por `CAT`, precio en `Det_IPrecio` usando `Moneda=DOP` por defecto)
- `GET /api/articulos/:id`
- `GET /api/productos/:id`

## Nota (Prisma Client)

Si cambiaste `prisma/schema.prisma` (por ejemplo agregando columnas como `createdByUserId`) asegúrate de:

```bash
npm run generate
```

y **reiniciar** el proceso del backend (`npm run dev`), porque Node puede quedarse con el Prisma Client anterior en memoria.
