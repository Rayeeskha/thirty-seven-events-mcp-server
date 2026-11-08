import { afterEach, describe, expect, it, jest } from '@jest/globals';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

/** Loads src/config/env.ts afresh with the given overrides. */
function loadEnv(overrides: Record<string, string>) {
  Object.assign(process.env, overrides);
  let loaded: typeof import('../../src/config/env') | undefined;
  jest.isolateModules(() => {
    loaded = require('../../src/config/env');
  });
  return loaded!.env;
}

describe('environment configuration', () => {
  it('applies the documented defaults when variables are absent', () => {
    for (const key of ['MCP_PATH', 'MCP_PORT', 'MCP_HOST', 'MCP_ALLOWED_HOSTS', 'CONFIRMATION_TTL_SECONDS', 'DB_HOST', 'DB_PORT']) delete process.env[key];
    const env = loadEnv({ DB_NAME: 'x_test', DB_USER: 'u', DB_PASSWORD: 'p' });
    expect(env).toMatchObject({ MCP_PATH: '/mcp', MCP_PORT: 3001, MCP_HOST: '127.0.0.1', CONFIRMATION_TTL_SECONDS: 300, DB_HOST: '127.0.0.1', DB_PORT: 3306, MCP_ALLOWED_HOSTS: [] });
  });

  it('parses a comma-separated allowed-hosts list, trimming blanks', () => {
    expect(loadEnv({ MCP_ALLOWED_HOSTS: ' a.example.com, b.example.com ,, ' }).MCP_ALLOWED_HOSTS).toEqual(['a.example.com', 'b.example.com']);
  });

  it('converts numbers and booleans from strings', () => {
    expect(loadEnv({ MCP_PORT: '8080', CONFIRMATION_TTL_SECONDS: '60', DB_LOGGING: 'true' })).toMatchObject({ MCP_PORT: 8080, CONFIRMATION_TTL_SECONDS: 60, DB_LOGGING: true });
  });

  it.each([
    ['MCP_PATH', 'mcp'],
    ['MCP_PATH', '/bad path'],
    ['MCP_PATH', '/a?b=1'],
    ['CONFIRMATION_TTL_SECONDS', '0'],
    ['CONFIRMATION_TTL_SECONDS', '99999'],
    ['CONFIRMATION_TTL_SECONDS', 'soon'],
    ['MCP_PORT', 'abc'],
    ['MCP_PORT', '-1'],
    ['DB_NAME', ''],
    ['DB_USER', ''],
    ['DB_LOGGING', 'yes'],
    ['NODE_ENV', 'staging'],
  ])('fails fast, naming the variable, for %s=%p', (name, value) => {
    expect(() => loadEnv({ [name]: value })).toThrow(new RegExp(`Invalid environment configuration[\\s\\S]*${name}`));
  });
});
