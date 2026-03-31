import type { Router } from 'express';
import { getPrisma } from '../prisma.js';

export function registerOrderStatusesRoutes(router: Router) {
  router.get('/order-statuses', async (_req, res, next) => {
    try {
      const prisma = await getPrisma();
      const rows = await prisma.appOrderStatus.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        select: {
          code: true,
          label: true,
          tableStatus: true,
          color: true
        }
      });
      res.json({ statuses: rows });
    } catch (err) {
      next(err);
    }
  });
}
