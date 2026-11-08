import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  CONFIRMATION_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(300),
  MCP_PATH: z
    .string()
    .regex(/^\/[\w\-/]*$/, 'must start with "/" and contain only letters, digits, "-", "_" or "/"')
    .default('/mcp'),
  MCP_HOST: z.string().min(1).default('127.0.0.1'),
  MCP_PORT: z.coerce.number().int().positive().default(3001),
  MCP_ALLOWED_HOSTS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean),
    ),
  DB_LOGGING: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}

export const env = loadEnv(process.env);
