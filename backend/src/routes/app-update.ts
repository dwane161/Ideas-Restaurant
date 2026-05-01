import type { Request, Router } from 'express';
import { getPrisma } from '../prisma.js';

const UPDATE_KEYS = [
  'app.android.enabled',
  'app.android.latestVersionCode',
  'app.android.latestVersionName',
  'app.android.minSupportedVersionCode',
  'app.android.apkUrl',
  'app.android.releaseNotes',
  'app.android.required',
] as const;

export function registerAppUpdateRoutes(router: Router) {
  router.get('/app-update/android', async (req, res, next) => {
    try {
      const prisma = await getPrisma();
      const rows = await prisma.appSetting.findMany({
        where: { key: { in: [...UPDATE_KEYS] } },
        select: { key: true, value: true },
      });

      const settings = new Map(rows.map((r) => [r.key, r.value ?? '']));
      const latestVersionCode = toInt(settings.get('app.android.latestVersionCode'));
      const minSupportedVersionCode = toInt(settings.get('app.android.minSupportedVersionCode'));
      const currentVersionCode = toInt(String(req.query.currentVersionCode ?? ''));
      const rawUrl = (settings.get('app.android.apkUrl') ?? '').trim();
      const downloadUrl = rawUrl ? toAbsoluteUrl(req, rawUrl) : '';
      const enabled = toBool(settings.get('app.android.enabled'), Boolean(downloadUrl && latestVersionCode > 0));
      const updateAvailable = enabled && latestVersionCode > 0 && currentVersionCode > 0 && latestVersionCode > currentVersionCode;
      const required =
        updateAvailable &&
        (toBool(settings.get('app.android.required'), false) ||
          (minSupportedVersionCode > 0 && currentVersionCode < minSupportedVersionCode));

      res.json({
        platform: 'android',
        enabled,
        updateAvailable,
        required,
        latestVersionCode,
        latestVersionName: (settings.get('app.android.latestVersionName') ?? '').trim(),
        minSupportedVersionCode,
        downloadUrl,
        releaseNotes: (settings.get('app.android.releaseNotes') ?? '').trim(),
      });
    } catch (err) {
      next(err);
    }
  });
}

function toInt(value: unknown): number {
  const n = Number(String(value ?? '').trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function toBool(value: unknown, fallback: boolean): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'si', 'sí', 'y'].includes(normalized);
}

function toAbsoluteUrl(req: Request, value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  const protocol = String(req.get('x-forwarded-proto') ?? req.protocol ?? 'https').split(',')[0].trim();
  const host = req.get('host') ?? '';
  const path = value.startsWith('/') ? value : `/${value}`;
  return `${protocol}://${host}${path}`;
}
