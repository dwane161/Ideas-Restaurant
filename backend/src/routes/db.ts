import type { Router } from 'express';
import { getPrisma } from '../prisma.js';

export function registerDbRoutes(router: Router) {
  router.get('/db/ping', async (_req, res, next) => {
    try {
      const prisma = await getPrisma();
      const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
      res.json({ ok: true, db: rows?.[0]?.ok ?? 1 });
    } catch (err) {
      next(err);
    }
  });

  router.get('/db/time', async (_req, res, next) => {
    try {
      const prisma = await getPrisma();
      const rows = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT SYSDATETIMEOFFSET() AS now`;
      res.json({ now: rows?.[0]?.now });
    } catch (err) {
      next(err);
    }
  });
}
