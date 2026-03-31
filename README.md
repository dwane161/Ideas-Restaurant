# Ideas-Restaurant

## Deploy automático por FTP (GitHub Actions)

Este repo incluye un workflow en `.github/workflows/deploy-ftp.yml` que compila el backend en Windows (para Prisma + MSSQL) y lo sube por FTP cuando:
- se hace `push` a `main`, o
- un PR hacia `main` se cierra y fue **mergeado**, o
- se ejecuta manualmente (Actions → Run workflow).

Configura estos **GitHub Secrets** (Settings → Secrets and variables → Actions):
- `FTP_SERVER` (ej: `win8211.site4now.net`)
- `FTP_USERNAME` (ej: `ideasos-001`)
- `FTP_PASSWORD`
- `FTP_SERVER_DIR` (carpeta remota donde está tu Node app, ej: `/www/ideas-restaurant/`)

Nota: en el hosting, define `DATABASE_URL` (y demás variables) como variables de entorno del sitio; el workflow no sube `.env`.

### Importante (node_modules)

Para que el deploy por FTP sea **rápido y estable**, el workflow sube **solo**:
- `backend/dist/`
- `backend/prisma/`
- `backend/package.json`

`node_modules` se mantiene instalado en el servidor. Si cambias dependencias (`backend/package.json`), haz un mantenimiento:
- detener la app Node en el hosting,
- actualizar/instalar dependencias en el servidor (según lo que permita el panel),
- volver a iniciar la app.

## Android APK por push a main (GitHub Actions)

Workflow: `.github/workflows/android-apk-email.yml`

Al hacer `push` a `main`:
- compila el APK (release firmado),
- lo sube como **artifact**,
- y opcionalmente lo envía por correo (SMTP).

### Secrets requeridos (APK firmado)

- `ANDROID_KEYSTORE_BASE64` (tu `.jks` en base64)
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

### Secrets opcionales (correo)

- `SMTP_HOST`
- `SMTP_PORT` (ej: `587`)
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `MAIL_TO`
- `MAIL_FROM`

Nota: si GitHub Actions está bloqueado por billing, este workflow no podrá ejecutarse.

