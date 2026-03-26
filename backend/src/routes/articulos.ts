import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';

const listQuerySchema = z.object({
  q: z.string().min(1).optional(),
  status: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  take: z.coerce.number().int().positive().max(200).optional().default(50),
  skip: z.coerce.number().int().nonnegative().optional().default(0)
});

export function registerArticulosRoutes(router: Router) {
  router.get('/articulos', async (req, res, next) => {
    try {
      const query = listQuerySchema.parse(req.query);

      const items = await prisma.aux_CArticulos.findMany({
        where: {
          ...(query.status === undefined ? {} : { CA_Status: query.status }),
          ...(query.q
            ? {
                OR: [
                  { CA_ID: { contains: query.q } },
                  { CA_Desc: { contains: query.q } }
                ]
              }
            : {})
        },
        orderBy: { CA_ID: 'asc' },
        select: {
          CA_ID: true,
          CA_Desc: true,
          CA_Status: true
        },
        take: query.take,
        skip: query.skip
      });

      res.json({ items, take: query.take, skip: query.skip });
    } catch (err) {
      next(err);
    }
  });

  router.get('/articulos/:id', async (req, res, next) => {
    try {
      const id = z.string().min(1).parse(req.params.id);
      const item = await prisma.aux_CArticulos.findUnique({ where: { CA_ID: id } });
      if (!item) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });
}
