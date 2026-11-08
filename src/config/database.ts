import { Sequelize } from "sequelize";
import { env } from "./env";
import { logger } from "../utils/logger";

export const sequelize = new Sequelize(
  env.DB_NAME,
  env.DB_USER,
  env.DB_PASSWORD,
  {
    host: env.DB_HOST,
    port: env.DB_PORT,
    dialect: "mysql",
    pool: {
      max: env.DB_POOL_MAX,
      min: env.DB_POOL_MIN,
      idle: env.DB_POOL_IDLE_MS,
      acquire: env.DB_POOL_ACQUIRE_MS,
    },
    logging: env.DB_LOGGING ? (sql) => logger.debug(sql) : false,
    define: {
      charset: "utf8mb4",
      collate: "utf8mb4_unicode_ci",
    },
  },
);

export async function connectDatabase(): Promise<void> {
  await sequelize.authenticate();
}

export async function disconnectDatabase(): Promise<void> {
  await sequelize.close();
}
