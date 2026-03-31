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
      const appTable = (prisma as unknown as { appTable?: { findMany?: Function } }).appTable;
      if (!appTable?.findMany) {
        res.status(500).json({
          error:
            'Prisma Client desactualizado: falta el modelo AppTable. Ejecuta `npm install` (o `npx prisma generate`) y reinicia el backend.',
        });
        return;
      }
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
