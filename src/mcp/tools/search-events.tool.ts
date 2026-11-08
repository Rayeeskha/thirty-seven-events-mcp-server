import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP_TOOLS_CONFIG } from "../../config/mcp-tools.config";
import { Services } from "../../container";
import { searchEventsSchema } from "../../modules/events/event.validation";
import { runTool } from "../tool-result";

export function registerSearchEventsTool(
  server: McpServer,
  { eventService }: Services,
): void {
  const config = MCP_TOOLS_CONFIG.searchEvents;
  server.registerTool(
    config.name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      annotations: config.annotations,
    },
    (args) =>
      runTool(() => eventService.searchEvents(searchEventsSchema.parse(args))),
  );
}
