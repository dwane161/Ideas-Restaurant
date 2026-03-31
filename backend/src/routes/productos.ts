import type { Router } from 'express';
import { z } from 'zod';
import { getPrisma } from '../prisma.js';

const listQuerySchema = z.object({
  cat: z.string().min(1).optional(),
  q: z.string().min(1).optional(),
  moneda: z.string().min(1).optional(),
  nprecio: z.string().min(1).optional(),
  status: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  take: z.coerce.number().int().positive().max(200).optional().default(50),
  skip: z.coerce.number().int().nonnegative().optional().default(0)
});

export function registerProductosRoutes(router: Router) {
  router.get('/productos', async (req, res, next) => {
    try {
      const prisma = await getPrisma();
      const query = listQuerySchema.parse(req.query);
      const moneda = query.moneda ?? 'DOP';

      const items = await prisma.maint_Inventario.findMany({
        where: {
          ...(query.status === undefined ? {} : { Art_Status: query.status }),
          ...(query.cat ? { CAT: query.cat } : {}),
          ...(query.q
            ? {
                OR: [
                  { Art_ID: { contains: query.q } },
                  { Art_Desc: { contains: query.q } }
                ]
              }
            : {})
        },
        orderBy: { Art_ID: 'asc' },
        select: {
          Art_ID: true,
          Art_Desc: true,
          Art_Status: true,
          CAT: true,
          Photo: true
        },
        take: query.take,
        skip: query.skip
      });

      const artIds = items.map((i) => i.Art_ID);
      const priceRows =
        artIds.length === 0
          ? []
          : await prisma.det_IPrecio.findMany({
              where: {
                Articulo: { in: artIds },
                Moneda: moneda,
                ...(query.nprecio ? { NPrecio: query.nprecio } : {})
              },
              orderBy: { Counter: 'desc' },
              select: {
                Articulo: true,
                Moneda: true,
                NPrecio: true,
                Precio: true,
                Counter: true
              }
            });

      const priceByArticulo = new Map<string, number>();
      for (const row of priceRows) {
        if (priceByArticulo.has(row.Articulo)) continue;
        const value = row.Precio == null ? 0 : Number(row.Precio);
        priceByArticulo.set(row.Articulo, Number.isFinite(value) ? value : 0);
      }

      const enriched = items.map((i) => ({
        ...i,
        price: priceByArticulo.get(i.Art_ID) ?? 0
      }));

      res.json({ items: enriched, take: query.take, skip: query.skip });
    } catch (err) {
      next(err);
    }
  });

  router.get('/productos/:id', async (req, res, next) => {
    try {
      const prisma = await getPrisma();
      const id = z.string().min(1).parse(req.params.id);
      const item = await prisma.maint_Inventario.findUnique({
        where: { Art_ID: id },
        select: { Art_ID: true, Art_Desc: true, Art_Status: true, CAT: true, Photo: true }
      });
      if (!item) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      const row = await prisma.det_IPrecio.findFirst({
        where: { Articulo: id, Moneda: 'DOP' },
        orderBy: { Counter: 'desc' },
        select: { Precio: true, Moneda: true, NPrecio: true }
      });

      const price = row?.Precio == null ? 0 : Number(row.Precio);
      res.json({
        item: {
          ...item,
          price: Number.isFinite(price) ? price : 0,
          moneda: row?.Moneda ?? null,
          nprecio: row?.NPrecio ?? null
        }
      });
    } catch (err) {
      next(err);
    }
  });
}
