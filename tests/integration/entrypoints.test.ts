/** The server is tested as a real process: startup, serving, shutdown, and failing fast. */
import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ChildProcess, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { resetDatabase } from '../helpers/database';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

interface RunningProcess {
  child: ChildProcess;
  output: () => string;
  exited: Promise<number | null>;
}

const running: ChildProcess[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

function start(entrypoint: string, env: Record<string, string>): RunningProcess {
  // NODE_ENV is not "test" here because the logger is silent under test and we read its output.
  const child = spawn(process.execPath, ['--import', 'tsx', entrypoint], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, NODE_ENV: 'development', ...env },
  });
  running.push(child);
  let collected = '';
  child.stdout?.on('data', (chunk) => (collected += chunk));
  child.stderr?.on('data', (chunk) => (collected += chunk));
  const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
  return { child, output: () => collected, exited };
}

async function waitUntil(condition: () => boolean | Promise<boolean>, what: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

// The spawned processes read the same test database, so give them known data.
beforeAll(resetDatabase);

afterEach(async () => {
  for (const child of running.splice(0)) {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await new Promise((resolve) => child.once('exit', resolve));
    }
  }
});

describe('MCP server (src/server.ts)', () => {
  it('serves the MCP endpoint and nothing else', async () => {
    const port = await freePort();
    const proc = start('src/server.ts', { MCP_PORT: String(port), MCP_HOST: '127.0.0.1' });
    await waitUntil(() => proc.output().includes('MCP server listening'), 'the MCP server to start');
    expect(proc.output()).toContain(`127.0.0.1:${port}`);

    const client = new Client({ name: 'entrypoint-test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(5);
      const result = await client.callTool({ name: 'get_event_details', arguments: { event_id: 1 } });
      expect(result.isError).toBeFalsy();
    } finally {
      await client.close();
    }

    const rest = await fetch(`http://127.0.0.1:${port}/api/events`);
    expect(rest.status).toBe(404); // any other path is not found
    const docs = await fetch(`http://127.0.0.1:${port}/api-docs/`);
    expect(docs.status).toBe(404);
  });

  it('honours a custom MCP_PATH', async () => {
    const port = await freePort();
    const proc = start('src/server.ts', { MCP_PORT: String(port), MCP_PATH: '/custom/endpoint' });
    await waitUntil(() => proc.output().includes('MCP server listening'), 'the MCP server to start');

    const client = new Client({ name: 'entrypoint-test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/custom/endpoint`)));
    expect((await client.listTools()).tools).toHaveLength(5);
    await client.close();
    expect((await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST' })).status).toBe(404);
  });

  it('accepts a configured public host name, which a tunnelled deployment needs', async () => {
    const port = await freePort();
    const proc = start('src/server.ts', { MCP_PORT: String(port), MCP_ALLOWED_HOSTS: 'mcp.example.com' });
    await waitUntil(() => proc.output().includes('MCP server listening'), 'the MCP server to start');

    const initialize = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    const allowed = await new Promise<number>((resolve, reject) => {
      const req = require('node:http').request({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { ...headers, host: 'mcp.example.com' } }, (res: { statusCode: number; resume: () => void }) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end(initialize);
    });
    expect(allowed).toBe(200);
  });

  it('shuts down cleanly on SIGTERM', async () => {
    const port = await freePort();
    const proc = start('src/server.ts', { MCP_PORT: String(port) });
    await waitUntil(() => proc.output().includes('MCP server listening'), 'the MCP server to start');

    proc.child.kill('SIGTERM');
    expect(await proc.exited).toBe(0);
    expect(proc.output()).toContain('SIGTERM received');
    await expect(fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST' })).rejects.toThrow();
  });
});

describe('src/server.ts fails fast instead of starting half-configured', () => {
  const entrypoint = 'src/server.ts';
  const portVariable = 'MCP_PORT';
  it('exits with code 1 and a readable message for invalid configuration', async () => {
    const proc = start(entrypoint, { MCP_PATH: 'no-leading-slash', [portVariable]: String(await freePort()) });
    expect(await proc.exited).toBe(1);
    expect(proc.output()).toMatch(/Invalid environment configuration[\s\S]*MCP_PATH/);
  });

  it('exits with code 1 when the database is unreachable, without ever listening', async () => {
    const dead = await freePort(); // nothing listens here
    const proc = start(entrypoint, { DB_PORT: String(dead), [portVariable]: String(await freePort()) });
    expect(await proc.exited).toBe(1);
    expect(proc.output()).toContain('Failed to start');
    expect(proc.output()).not.toContain('listening');
  });
});
