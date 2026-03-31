import type { Router } from 'express';
import { z } from 'zod';
import { getPrisma } from '../prisma.js';

const listSchema = z.object({
  q: z.string().optional(),
  take: z.coerce.number().int().min(1).max(200).optional()
});

function displayName(row: { Cliente_FullName: string | null; Cliente_FirstName: string | null; Cliente_LastName: string | null }): string {
  const full = (row.Cliente_FullName ?? '').trim();
  if (full) return full;
  const first = (row.Cliente_FirstName ?? '').trim();
  const last = (row.Cliente_LastName ?? '').trim();
  const combined = `${first} ${last}`.trim();
  return combined || '—';
}

export function registerClientesRoutes(router: Router) {
  router.get('/clientes', async (req, res, next) => {
    try {
      const prisma = await getPrisma();
      const { q, take } = listSchema.parse(req.query);
      const query = (q ?? '').trim();
      const limit = take ?? 50;

      const rows = await prisma.maint_Clientes.findMany({
        take: limit,
        where: {
          AND: [
            {
              OR: [
                { Cliente_Status: 1 },
                { Cliente_Status: { equals: null } }
              ]
            },
            query
              ? {
                  OR: [
                    { Cliente_Id: { contains: query } },
                    { Cliente_FullName: { contains: query } },
                    { Cliente_FirstName: { contains: query } },
                    { Cliente_LastName: { contains: query } }
                  ]
                }
              : {}
          ]
        },
        orderBy: [{ Cliente_FullName: 'asc' }],
        select: {
          Cliente_Id: true,
          Cliente_FullName: true,
          Cliente_FirstName: true,
          Cliente_LastName: true
        }
      });

      res.json({
        clientes: rows.map((r) => ({
          id: r.Cliente_Id,
          name: displayName({
            Cliente_FullName: r.Cliente_FullName ?? null,
            Cliente_FirstName: r.Cliente_FirstName ?? null,
            Cliente_LastName: r.Cliente_LastName ?? null
          })
        }))
      });
    } catch (err) {
      next(err);
    }
  });
}
