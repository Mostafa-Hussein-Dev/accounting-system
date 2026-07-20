import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().positive().optional(),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),
  // Defaults point at the mailpit dev container (docker-compose.yml) — no
  // auth/TLS needed locally. Set real SMTP credentials in production.
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  // z.coerce.boolean() is a footgun here — Boolean("false") is true in JS,
  // so it would silently treat SMTP_SECURE=false as enabled. Parse the
  // string explicitly instead.
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('Accounting System <no-reply@example.com>'),
  // Comma-separated list of allowed browser origins (the frontend's dev
  // server / deployed URL) — the API has no CORS policy without this, so no
  // browser-based request (from any origin, including the frontend) can
  // ever succeed; only non-browser clients (curl, server-to-server) work.
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
});

type ParsedEnv = z.infer<typeof envSchema>;

export type EnvConfig = Omit<ParsedEnv, 'DATABASE_URL'> & {
  DATABASE_URL: string;
};

function buildDatabaseUrl(env: ParsedEnv): string {
  const user = encodeURIComponent(env.DB_USER ?? '');
  const password = encodeURIComponent(env.DB_PASSWORD ?? '');
  return `postgresql://${user}:${password}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}?schema=public`;
}

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = result.data;

  if (env.DATABASE_URL) {
    return { ...env, DATABASE_URL: env.DATABASE_URL };
  }

  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = env;
  if (!DB_HOST || !DB_PORT || !DB_NAME || !DB_USER || !DB_PASSWORD) {
    throw new Error(
      'Invalid environment configuration:\n' +
        '- DATABASE_URL: must be set directly, or DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD must all be set so it can be derived',
    );
  }

  return { ...env, DATABASE_URL: buildDatabaseUrl(env) };
}
