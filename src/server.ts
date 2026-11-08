import { createApp } from './app';
import { exitOnStartupFailure, startHttpServer } from './bootstrap';
import { env } from './config/env';
import { buildServices } from './container';

startHttpServer(createApp(buildServices()), { label: 'MCP server', host: env.MCP_HOST, port: env.MCP_PORT }).catch(exitOnStartupFailure);
