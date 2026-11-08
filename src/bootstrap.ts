import { Express } from "express";
import { Server } from "node:http";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { LOG_MESSAGES } from "./config/messages";
import { logger } from "./utils/logger";

interface HttpServerOptions {
  label: string;
  port: number;
  host?: string;
}

/** Connects to MySQL, starts the HTTP server, and wires graceful shutdown. */
export async function startHttpServer(
  app: Express,
  { label, port, host }: HttpServerOptions,
): Promise<Server> {
  await connectDatabase();
  const server = host ? app.listen(port, host) : app.listen(port);
  server.once("listening", () =>
    logger.info(`${label} listening on ${host ?? "0.0.0.0"}:${port}`),
  );

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received, shutting down ${label}`);
    server.close(() => {
      disconnectDatabase().finally(() => process.exit(0));
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  return server;
}

export function exitOnStartupFailure(error: unknown): never {
  logger.error(LOG_MESSAGES.startupFailed, error);
  process.exit(1);
}
