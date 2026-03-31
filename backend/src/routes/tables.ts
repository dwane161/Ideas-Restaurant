import type { Router } from 'express';
import { z } from 'zod';
import { getPrisma } from '../prisma.js';

const listSchema = z.object({
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? true : v === 'true')),
});

export function registerTablesRoutes(router: Router) {
  router.get('/tables', async (req, res, next) => {
    try {
      const prisma = await getPrisma();
      const { active } = listSchema.parse(req.query);

      const rows = await prisma.appTable.findMany({
        where: active ? { isActive: true } : {},
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          seats: true,
          section: true,
          sortOrder: true,
          isActive: true,
        },
      });

      res.json({
        tables: rows.map((t) => ({
          id: t.id,
          seats: t.seats,
          section: t.section ?? null,
          sortOrder: t.sortOrder,
          isActive: t.isActive,
        })),
      });
    } catch (err) {
      next(err);
    }
  });
}

