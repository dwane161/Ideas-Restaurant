import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { loadEnv } from './env.js';
import { registerAppUpdateRoutes } from './routes/app-update.js';
import { registerArticulosRoutes } from './routes/articulos.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBusinessesRoutes } from './routes/businesses.js';
import { registerClientesRoutes } from './routes/clientes.js';
import { registerDbRoutes } from './routes/db.js';
import { registerOrderStatusesRoutes } from './routes/order-statuses.js';
import { registerOrderItemStatusesRoutes } from './routes/order-item-statuses.js';
import { registerOrdersRoutes } from './routes/orders.js';
import { registerProductosRoutes } from './routes/productos.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerTablesRoutes } from './routes/tables.js';

const env = loadEnv();

const app = express();
app.disable('x-powered-by');

const mobileAppOrigins = new Set([
  // Capacitor / Ionic WebView
  'capacitor://localhost',
  'ionic://localhost',
  // Local dev / emulators
  'http://localhost',
  'https://localhost',
  'http://localhost:8100',
  'http://localhost:4200',
  'http://localhost:8080'
]);

const corsAllowlist = (env.CORS_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser clients may not send Origin; allow those.
      if (!origin) return callback(null, true);

      // Always allow Capacitor/Ionic local origins (Android/iOS builds).
      if (mobileAppOrigins.has(origin)) return callback(null, true);

      // If unset, be permissive (easier hosting setup). Use env.CORS_ORIGIN to restrict.
      if (corsAllowlist.length === 0) return callback(null, true);

      // Support '*' as "allow any origin".
      if (corsAllowlist.length === 1 && corsAllowlist[0] === '*') return callback(null, true);

      return callback(null, corsAllowlist.includes(origin));
    },
    credentials: false
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use(
  '/downloads',
  express.static('downloads', {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  })
);

const api = express.Router();
registerDbRoutes(api);
registerAuthRoutes(api);
registerAppUpdateRoutes(api);
registerBusinessesRoutes(api);
registerClientesRoutes(api);
registerOrderStatusesRoutes(api);
registerOrderItemStatusesRoutes(api);
registerArticulosRoutes(api);
registerProductosRoutes(api);
registerOrdersRoutes(api);
registerSettingsRoutes(api);
registerTablesRoutes(api);
app.use('/api', api);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof Error) {
    res.status(500).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: 'Unknown error' });
});

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[backend] listening on http://localhost:${env.PORT}`);
});
