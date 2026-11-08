import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP_TOOLS_CONFIG } from "../../config/mcp-tools.config";
import { Services } from "../../container";
import { createEventRequestSchema } from "../../modules/events/event.validation";
import { runTool } from "../tool-result";

export function registerAddEventTool(
  server: McpServer,
  { eventCommandService }: Services,
): void {
  const config = MCP_TOOLS_CONFIG.addEvent;
  server.registerTool(
    config.name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      annotations: config.annotations,
    },
    (args) =>
      runTool(() =>
        eventCommandService.createEvent(createEventRequestSchema.parse(args)),
      ),
  );
}
