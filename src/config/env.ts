import dotenv from "dotenv";
import { z } from "zod";
import { ERROR_MESSAGES, VALIDATION_MESSAGES } from "./messages";

dotenv.config({ quiet: true });

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DB_HOST: z.string().min(1).default("127.0.0.1"),
    DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
    DB_NAME: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string(),
    DB_POOL_MAX: z.coerce.number().int().positive().default(5),
    DB_POOL_MIN: z.coerce.number().int().nonnegative().default(0),
    DB_POOL_IDLE_MS: z.coerce.number().int().positive().default(10000),
    DB_POOL_ACQUIRE_MS: z.coerce.number().int().positive().default(60000),
    CONFIRMATION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3600)
      .default(300),
    MCP_PATH: z
      .string()
      .regex(
        /^\/[\w\-/]*$/,
        'must start with "/" and contain only letters, digits, "-", "_" or "/"',
      )
      .default("/mcp"),
    MCP_HOST: z.string().min(1).default("127.0.0.1"),
    MCP_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    MCP_ALLOWED_HOSTS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((host) => host.trim())
          .filter(Boolean),
      ),
    DB_LOGGING: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV === "production" && config.DB_PASSWORD.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["DB_PASSWORD"],
        message: VALIDATION_MESSAGES.databasePasswordRequiredInProduction,
      });
    }
    if (config.DB_POOL_MIN > config.DB_POOL_MAX) {
      context.addIssue({
        code: "custom",
        path: ["DB_POOL_MIN"],
        message: VALIDATION_MESSAGES.poolMinimumExceedsMaximum,
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(ERROR_MESSAGES.invalidEnvironmentConfiguration(problems));
  }
  return result.data;
}

export const env = loadEnv(process.env);
