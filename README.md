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
