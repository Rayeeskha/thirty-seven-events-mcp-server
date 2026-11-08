import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Services } from '../container';
import { registerTools } from './tools';

const SERVER_INSTRUCTIONS =
  'Tools for managing Thirty Seven Events data. Adding an event or changing an event\'s status always requires ' +
  'the user\'s explicit confirmation: first call the tool without a confirmation_token, show the returned summary ' +
  'to the user and ask whether to proceed, and call again with the token only after the user clearly says yes. ' +
  'Never assume confirmation.';

export function createMcpServer(services: Services): McpServer {
  const server = new McpServer(
    { name: 'thirty-seven-events', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS },
  );
  registerTools(server, services);
  return server;
}
