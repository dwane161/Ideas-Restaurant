import type { Router } from 'express';
import { getPrisma } from '../prisma.js';

export function registerOrderItemStatusesRoutes(router: Router) {
  router.get('/order-item-statuses', async (_req, res, next) => {
    try {
      const prisma = await getPrisma();
      const rows = await prisma.appOrderItemStatus.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        select: {
          code: true,
          label: true,
          color: true
        }
      });
      res.json({ statuses: rows });
    } catch (err) {
      next(err);
    }
  });
}
