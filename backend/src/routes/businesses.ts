import type { Router } from 'express';
import { getPrisma } from '../prisma.js';

export function registerBusinessesRoutes(router: Router) {
  router.get('/business', async (_req, res, next) => {
    try {
      const prisma = await getPrisma();

      // Prefer an "active" business, but fall back to any row (some DBs may not maintain Business_Status).
      const b =
        (await prisma.maint_Businesses.findFirst({
          where: { Business_Status: 1 },
          orderBy: { Business_Id: 'asc' },
        })) ??
        (await prisma.maint_Businesses.findFirst({
          orderBy: { Business_Id: 'asc' },
        }));

      if (!b) {
        res.json({ business: null });
        return;
      }

      const name = (b.Business_Desc ?? b.Business_Id ?? '').trim() || null;
      const rnc = (b.Business_RNC ?? '').trim() || null;
      const address = (b.Business_FullAddress ?? b.Business_Address ?? '').trim() || null;

      const phones = [b.Business_PhoneData1, b.Business_PhoneData2]
        .map((p) => (p ?? '').trim())
        .filter(Boolean);
      const phone = phones.length > 0 ? phones.join(' / ') : null;

      const email = (b.Business_eMailData ?? '').trim() || null;

      res.json({
        business: {
          id: b.Business_Id,
          name,
          rnc,
          address,
          phone,
          email,
          website: (b.Business_WebPageData ?? '').trim() || null,
        },
      });
    } catch (err) {
      next(err);
    }
  });
}
