import express, { Express } from 'express';
import { env } from './config/env';
import { Services } from './container';
import { createMcpRouter } from './mcp/mcp-transport';
import { errorHandler } from './middlewares/error-handler';
import { notFoundHandler } from './middlewares/not-found';

/** The whole HTTP surface: the MCP endpoint at MCP_PATH, and nothing else. */
export function createApp(services: Services): Express {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(env.MCP_PATH, createMcpRouter(services));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
