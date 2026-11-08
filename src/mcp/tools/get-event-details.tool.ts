import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP_TOOLS_CONFIG } from "../../config/mcp-tools.config";
import { Services } from "../../container";
import { eventIdSchema } from "../../modules/events/event.validation";
import { runTool } from "../tool-result";

export function registerGetEventDetailsTool(
  server: McpServer,
  { eventService }: Services,
): void {
  const config = MCP_TOOLS_CONFIG.getEventDetails;
  server.registerTool(
    config.name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      annotations: config.annotations,
    },
    ({ event_id }) =>
      runTool(() => eventService.getEventById(eventIdSchema.parse(event_id))),
  );
}
