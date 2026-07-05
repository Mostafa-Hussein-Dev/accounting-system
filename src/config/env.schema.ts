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
