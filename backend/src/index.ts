import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { loadEnv } from './env.js';
import { registerArticulosRoutes } from './routes/articulos.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDbRoutes } from './routes/db.js';
import { registerOrdersRoutes } from './routes/orders.js';
import { registerProductosRoutes } from './routes/productos.js';

const env = loadEnv();

const app = express();
app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: env.CORS_ORIGIN ?? true,
    credentials: true
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

const api = express.Router();
registerDbRoutes(api);
registerAuthRoutes(api);
registerArticulosRoutes(api);
registerProductosRoutes(api);
registerOrdersRoutes(api);
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
