import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP_TOOLS_CONFIG } from "../../config/mcp-tools.config";
import { Services } from "../../container";
import {
  eventIdSchema,
  updateEventStatusRequestSchema,
} from "../../modules/events/event.validation";
import { runTool } from "../tool-result";

export function registerUpdateEventStatusTool(
  server: McpServer,
  { eventCommandService }: Services,
): void {
  const config = MCP_TOOLS_CONFIG.updateEventStatus;
  server.registerTool(
    config.name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      annotations: config.annotations,
    },
    ({ event_id, ...rest }) =>
      runTool(() =>
        eventCommandService.updateEventStatus(
          eventIdSchema.parse(event_id),
          updateEventStatusRequestSchema.parse(rest),
        ),
      ),
  );
}
