import type { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma, PrismaClient } from '@prisma/client';
import { getPrisma } from '../prisma.js';
import { loadEnv } from '../env.js';

const loginSchema = z.object({
  pin: z.string().min(1)
});

const sessionSchema = z.object({
  sessionId: z.string().min(1).max(64)
});

type ClientLicenseRow = {
  ID: string;
  Activo: number | boolean;
  ISPos: number | boolean;
  License: number;
};

let sessionTableReady: Promise<void> | null = null;
let licensePrisma: PrismaClient | null = null;
let licensePrismaUrl: string | null = null;

export function registerAuthRoutes(router: Router) {
  router.post('/auth/login', async (req, res, next) => {
    try {
      const env = loadEnv();
      const prisma = await getPrisma();
      await ensureSessionTable();

      const client = await getClientLicense(env.APP_CLIENT_ID);
      if (!client) {
        res.status(403).json({ error: 'Cliente no autorizado para este POS' });
        return;
      }

      if (!isTruthy(client.Activo)) {
        res.status(403).json({ error: 'Cliente inactivo' });
        return;
      }

      if (!isTruthy(client.ISPos)) {
        res.status(403).json({ error: 'POS no habilitado para este cliente' });
        return;
      }

      const maxSessions = Number(client.License ?? 0);
      if (!Number.isFinite(maxSessions) || maxSessions <= 0) {
        res.status(403).json({ error: 'Cliente sin licencias POS disponibles' });
        return;
      }

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

      const sessionId = randomUUID();
      const sessionResult = await createLicensedSession({
        sessionId,
        clientId: env.APP_CLIENT_ID,
        userId: String(candidate.id),
        maxSessions,
        ttlMinutes: env.SESSION_TTL_MINUTES,
        userAgent: req.get('user-agent') ?? null
      });

      if (sessionResult === 'duplicate-user') {
        res.status(409).json({
          error: 'Este usuario ya tiene una sesión activa en otro dispositivo'
        });
        return;
      }

      if (sessionResult === 'license-limit') {
        res.status(429).json({
          error: 'Error de conexión, favor de comunicarse directamente con el soporte del app'
        });
        return;
      }

      res.json({
        user: {
          id: String(candidate.id),
          name: (candidate.name ?? '').trim() || String(candidate.id),
          sessionId
        }
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/heartbeat', async (req, res, next) => {
    try {
      const env = loadEnv();
      const { sessionId } = sessionSchema.parse(req.body);
      await ensureSessionTable();

      const updated = await touchSession(sessionId, env.APP_CLIENT_ID, env.SESSION_TTL_MINUTES);
      if (!updated) {
        res.status(401).json({ error: 'Sesión expirada' });
        return;
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/logout', async (req, res, next) => {
    try {
      const env = loadEnv();
      const { sessionId } = sessionSchema.parse(req.body);
      await ensureSessionTable();
      await revokeSession(sessionId, env.APP_CLIENT_ID);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
}

async function getClientLicense(clientId: string): Promise<ClientLicenseRow | null> {
  const prisma = await getLicensePrisma();
  try {
    const rows = await prisma.$queryRaw<ClientLicenseRow[]>`
      SELECT TOP 1
        CAST([ID] AS nvarchar(50)) AS [ID],
        [Activo],
        [ISPos],
        [License]
      FROM [MCliente]
      WHERE [ID] = ${clientId}
    `;
    return rows?.[0] ?? null;
  } catch (err) {
    if (isMissingMClienteError(err)) {
      throw new Error(
        'No se encontró la tabla MCliente. Configura LICENSE_DATABASE_URL apuntando a la BD central de licencias; DATABASE_URL debe seguir apuntando a la BD de Tituabar.',
      );
    }
    throw err;
  }
}

async function ensureSessionTable(): Promise<void> {
  if (!sessionTableReady) {
    sessionTableReady = (async () => {
      const prisma = await getPrisma();
      await prisma.$executeRawUnsafe(`
        IF OBJECT_ID(N'dbo.App_LoginSessions', N'U') IS NULL
        BEGIN
          CREATE TABLE dbo.App_LoginSessions (
            SessionId nvarchar(64) NOT NULL CONSTRAINT PK_App_LoginSessions PRIMARY KEY,
            ClientId nvarchar(50) NOT NULL,
            UserId nvarchar(50) NOT NULL,
            CreatedAt datetime2 NOT NULL CONSTRAINT DF_App_LoginSessions_CreatedAt DEFAULT SYSUTCDATETIME(),
            LastSeenAt datetime2 NOT NULL CONSTRAINT DF_App_LoginSessions_LastSeenAt DEFAULT SYSUTCDATETIME(),
            ExpiresAt datetime2 NOT NULL,
            RevokedAt datetime2 NULL,
            UserAgent nvarchar(250) NULL
          );

          CREATE INDEX IX_App_LoginSessions_Active
            ON dbo.App_LoginSessions (ClientId, RevokedAt, ExpiresAt)
            INCLUDE (UserId);
        END
      `);
    })().catch((err) => {
      sessionTableReady = null;
      throw err;
    });
  }
  return sessionTableReady;
}

async function createLicensedSession(args: {
  sessionId: string;
  clientId: string;
  userId: string;
  maxSessions: number;
  ttlMinutes: number;
  userAgent: string | null;
}): Promise<'created' | 'duplicate-user' | 'license-limit'> {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRaw<Array<{ result: string }>>`
    SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    BEGIN TRANSACTION;

    DECLARE @lockResult int;
    EXEC @lockResult = sp_getapplock
      @Resource = ${`App_LoginSessions:${args.clientId}`},
      @LockMode = 'Exclusive',
      @LockOwner = 'Transaction',
      @LockTimeout = 10000;

    DELETE FROM [App_LoginSessions]
    WHERE [ClientId] = ${args.clientId}
      AND ([RevokedAt] IS NOT NULL OR [ExpiresAt] <= SYSUTCDATETIME());

    IF @lockResult >= 0 AND EXISTS (
      SELECT 1
      FROM [App_LoginSessions] WITH (UPDLOCK, HOLDLOCK)
      WHERE [ClientId] = ${args.clientId}
        AND [UserId] = ${args.userId}
        AND [RevokedAt] IS NULL
        AND [ExpiresAt] > SYSUTCDATETIME()
    )
    BEGIN
      SELECT CAST('duplicate-user' AS nvarchar(30)) AS result;
    END
    ELSE IF @lockResult >= 0 AND (
      SELECT COUNT(1)
      FROM [App_LoginSessions] WITH (UPDLOCK, HOLDLOCK)
      WHERE [ClientId] = ${args.clientId}
        AND [RevokedAt] IS NULL
        AND [ExpiresAt] > SYSUTCDATETIME()
    ) < ${args.maxSessions}
    BEGIN
      INSERT INTO [App_LoginSessions] ([SessionId], [ClientId], [UserId], [ExpiresAt], [UserAgent])
      VALUES (
        ${args.sessionId},
        ${args.clientId},
        ${args.userId},
        DATEADD(minute, ${args.ttlMinutes}, SYSUTCDATETIME()),
        ${args.userAgent?.slice(0, 250) ?? null}
      );
      SELECT CAST('created' AS nvarchar(30)) AS result;
    END
    ELSE
    BEGIN
      SELECT CAST('license-limit' AS nvarchar(30)) AS result;
    END

    COMMIT TRANSACTION;
  `;
  const result = rows?.[0]?.result;
  return result === 'created' || result === 'duplicate-user' ? result : 'license-limit';
}

async function touchSession(sessionId: string, clientId: string, ttlMinutes: number): Promise<boolean> {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRaw<Array<{ updated: number }>>`
    UPDATE [App_LoginSessions]
    SET [LastSeenAt] = SYSUTCDATETIME(),
        [ExpiresAt] = DATEADD(minute, ${ttlMinutes}, SYSUTCDATETIME())
    WHERE [SessionId] = ${sessionId}
      AND [ClientId] = ${clientId}
      AND [RevokedAt] IS NULL
      AND [ExpiresAt] > SYSUTCDATETIME();

    SELECT CAST(@@ROWCOUNT AS int) AS updated;
  `;
  return Number(rows?.[0]?.updated ?? 0) === 1;
}

async function revokeSession(sessionId: string, clientId: string): Promise<void> {
  const prisma = await getPrisma();
  await prisma.$executeRaw`
    UPDATE [App_LoginSessions]
    SET [RevokedAt] = SYSUTCDATETIME(),
        [ExpiresAt] = SYSUTCDATETIME()
    WHERE [SessionId] = ${sessionId}
      AND [ClientId] = ${clientId}
      AND [RevokedAt] IS NULL
  `;
}

async function getLicensePrisma(): Promise<PrismaClient> {
  const env = loadEnv();
  const url = env.LICENSE_DATABASE_URL?.trim();
  if (!url) return getPrisma();

  if (!licensePrisma || licensePrismaUrl !== url) {
    if (licensePrisma) {
      try {
        await licensePrisma.$disconnect();
      } catch {
        // ignore
      }
    }
    licensePrisma = new PrismaClient({
      datasources: { db: { url } },
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
    licensePrismaUrl = url;
  }

  return licensePrisma;
}

function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value instanceof Prisma.Decimal) return value.toNumber() !== 0;
  return Number(value) !== 0;
}

function isMissingMClienteError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return message.includes("Invalid object name 'MCliente'") || message.includes('Invalid object name MCliente');
}
