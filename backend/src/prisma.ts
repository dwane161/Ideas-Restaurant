import { PrismaClient } from '@prisma/client';
import { loadEnv } from './env.js';

declare global {
  // eslint-disable-next-line no-var
  var __mainPrisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __mainPrismaUrl: string | undefined;
}

let initPromise: Promise<PrismaClient> | null = null;

function logConfig(msg: string): void {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log(`[prisma] ${msg}`);
  }
}

async function resolveMainDatabaseUrl(): Promise<string> {
  const env = loadEnv();

  if (env.DATABASE_URL && env.DATABASE_URL.trim()) {
    return env.DATABASE_URL.trim();
  }

  if (!env.CONFIG_DATABASE_URL || !env.CONFIG_DATABASE_URL.trim()) {
    throw new Error(
      'Missing DATABASE_URL. Provide DATABASE_URL or CONFIG_DATABASE_URL (bootstrap) to read backend.db.url from App_Settings.',
    );
  }

  const bootstrapUrl = env.CONFIG_DATABASE_URL.trim();

  // Use a short-lived PrismaClient to read the main URL from App_Settings.
  const bootstrap = new PrismaClient({
    datasources: { db: { url: bootstrapUrl } },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  try {
    const rows = await bootstrap.appSetting.findMany({
      where: {
        key: {
          in: [
            'backend.db.url',
            'backend.db.server',
            'backend.db.database',
            'backend.db.user',
            'backend.db.password',
          ],
        },
      },
      select: { key: true, value: true },
    });

    const dict = new Map<string, string>();
    for (const r of rows) {
      const k = String(r.key ?? '').trim();
      const v = String(r.value ?? '').trim();
      if (k) dict.set(k, v);
    }

    const mainUrl = (dict.get('backend.db.url') ?? '').trim();
    if (mainUrl) {
      logConfig('Using backend.db.url from App_Settings');
      return mainUrl;
    }

    const server = (dict.get('backend.db.server') ?? '').trim();
    const database = (dict.get('backend.db.database') ?? '').trim();
    const user = (dict.get('backend.db.user') ?? '').trim();
    const password = (dict.get('backend.db.password') ?? env.DB_PASSWORD ?? '').trim();

    if (server && database && user && password) {
      const host = server.includes(':') ? server : `${server}:1433`;
      const encodedUser = encodeURIComponent(user);
      const encodedPassword = encodeURIComponent(password);
      const url = `sqlserver://${host};database=${database};user=${encodedUser};password=${encodedPassword};encrypt=true;trustServerCertificate=true`;
      logConfig('Built DB URL from App_Settings backend.db.* fields');
      return url;
    }
  } catch {
    // If App_Settings doesn't exist yet or Prisma model missing, fall back to bootstrap.
  } finally {
    try {
      await bootstrap.$disconnect();
    } catch {
      // ignore
    }
  }

  logConfig('Falling back to CONFIG_DATABASE_URL as main URL');
  return bootstrapUrl;
}

async function initPrisma(): Promise<PrismaClient> {
  const url = await resolveMainDatabaseUrl();

  if (globalThis.__mainPrisma && globalThis.__mainPrismaUrl === url) {
    return globalThis.__mainPrisma;
  }

  // If URL changed (or not cached), create a new client.
  const prisma = new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

  if (process.env.NODE_ENV !== 'production') {
    globalThis.__mainPrisma = prisma;
    globalThis.__mainPrismaUrl = url;
  }

  return prisma;
}

export async function getPrisma(): Promise<PrismaClient> {
  if (!initPromise) initPromise = initPrisma();
  return initPromise;
}
