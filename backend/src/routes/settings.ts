import type { Router } from 'express';
import { z } from 'zod';
import { getPrisma } from '../prisma.js';

const SettingsKey = z.string().min(1).max(100);

const updateSettingsSchema = z.object({
  items: z.array(
    z.object({
      key: SettingsKey,
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    }),
  ),
});

export function registerSettingsRoutes(router: Router) {
  router.get('/settings', async (_req, res, next) => {
    try {
      const prisma = await getPrisma();

      const rows = await prisma.appSetting.findMany({
        select: { key: true, value: true, updatedAt: true },
        orderBy: { key: 'asc' },
      });

      res.json({
        items: rows.map((r) => ({
          key: r.key,
          value: r.value,
          updatedAt: r.updatedAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/settings', async (req, res, next) => {
    try {
      const { items } = updateSettingsSchema.parse(req.body);
      const prisma = await getPrisma();

      const normalized = items.map((i) => ({
        key: i.key.trim(),
        value:
          i.value === undefined
            ? undefined
            : i.value === null
              ? null
              : typeof i.value === 'string'
                ? i.value
                : String(i.value),
      }));

      await prisma.$transaction(
        normalized
          .filter((i) => i.key.length > 0 && i.value !== undefined)
          .map((i) =>
            prisma.appSetting.upsert({
              where: { key: i.key },
              create: { key: i.key, value: i.value },
              update: { value: i.value },
              select: { key: true },
            }),
          ),
      );

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
}
