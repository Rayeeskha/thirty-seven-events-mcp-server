import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP_SERVER_CONFIG } from "../config/mcp-tools.config";
import { Services } from "../container";
import { registerTools } from "./tools";

export function createMcpServer(services: Services): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_CONFIG.name, version: MCP_SERVER_CONFIG.version },
    { instructions: MCP_SERVER_CONFIG.instructions },
  );
  registerTools(server, services);
  return server;
}
