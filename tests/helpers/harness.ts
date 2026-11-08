import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { createApp } from '../../src/app';
import { buildServices, Services } from '../../src/container';
import { FakeClock } from './clock';
import { McpDriver } from './drivers';

export const CONFIRMATION_TTL_SECONDS = 300;

export interface Harness {
  baseUrl: string;
  mcpUrl: string;
  clock: FakeClock;
  mcp: McpDriver;
  connectMcp(): Promise<McpDriver>;
  close(): Promise<void>;
}

/** Starts the real MCP server on an ephemeral port, wired to the test database. */
export async function startHarness(overrides: Partial<Services> = {}): Promise<Harness> {
  const clock = new FakeClock();
  const services = {
    ...buildServices({ clock: clock.now, confirmationTtlSeconds: CONFIRMATION_TTL_SECONDS }),
    ...overrides,
  };

  const server = await new Promise<Server>((resolve) => {
    const listening = createApp(services).listen(0, '127.0.0.1', () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const mcpUrl = `${baseUrl}/mcp`;

  const extraClients: McpDriver[] = [];
  const mcp = await McpDriver.connect(mcpUrl);

  return {
    baseUrl,
    mcpUrl,
    clock,
    mcp,
    async connectMcp() {
      const driver = await McpDriver.connect(mcpUrl);
      extraClients.push(driver);
      return driver;
    },
    async close() {
      await Promise.all([mcp, ...extraClients].map((client) => client.close()));
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
