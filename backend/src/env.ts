import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  // Main DB URL (optional if you want to pull it from App_Settings via CONFIG_DATABASE_URL).
  DATABASE_URL: z.string().min(1).optional(),
  // Bootstrap DB URL used to read App_Settings (must be reachable at startup).
  CONFIG_DATABASE_URL: z.string().min(1).optional(),
  // Optional fallback if you store server/db/user in App_Settings but keep the password in env.
  DB_PASSWORD: z.string().optional(),
  CORS_ORIGIN: z.string().min(1).optional()
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${message}`);
  }
  return parsed.data;
}
