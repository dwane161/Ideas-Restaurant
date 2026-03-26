import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';

const loginSchema = z.object({
  pin: z.string().min(1)
});

export function registerAuthRoutes(router: Router) {
  router.post('/auth/login', async (req, res, next) => {
    try {
      const { pin } = loginSchema.parse(req.body);
      const normalizedPin = pin.trim();

      const pinColumnExists = async (): Promise<boolean> => {
        try {
          const rows = await prisma.$queryRaw<Array<{ ok: number }>>`
            SELECT TOP 1 1 AS ok
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'Maint_Users' AND COLUMN_NAME = 'PIN'
          `;
          return (rows?.[0]?.ok ?? 0) === 1;
        } catch {
          return false;
        }
      };

      const tryMaintUsersByPin = async () => {
        try {
          const hasPin = await pinColumnExists();
          if (!hasPin) return null;

          const rows = await prisma.$queryRaw<Array<{ id: string; name: string | null; status?: unknown }>>`
            SELECT TOP 1
              CAST([User_Id] AS nvarchar(50)) AS id,
              CAST([User_Desc] AS nvarchar(200)) AS name,
              [User_Status] AS status
            FROM [Maint_Users]
            WHERE [PIN] = ${normalizedPin}
          `;
          return rows?.[0] ?? null;
        } catch {
          return null;
        }
      };

      const tryMaintUsers = async () => {
        const user = await prisma.maint_Users.findFirst({
          where: { User_Password: normalizedPin },
          select: { User_Id: true, User_Desc: true, User_Status: true }
        });
        if (!user) return null;
        return {
          id: user.User_Id,
          name: user.User_Desc ?? null,
          status: user.User_Status ?? null
        };
      };

      const candidate = (await tryMaintUsersByPin()) ?? (await tryMaintUsers());
      if (!candidate) {
        res.status(401).json({ error: 'PIN inválido' });
        return;
      }

      if (candidate.status != null && Number(candidate.status) !== 1) {
        res.status(401).json({ error: 'Usuario inactivo' });
        return;
      }

      res.json({
        user: {
          id: String(candidate.id),
          name: (candidate.name ?? '').trim() || String(candidate.id)
        }
      });
    } catch (err) {
      next(err);
    }
  });
}
