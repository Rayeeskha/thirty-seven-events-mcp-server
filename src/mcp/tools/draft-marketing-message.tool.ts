import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP_TOOLS_CONFIG } from "../../config/mcp-tools.config";
import { Services } from "../../container";
import { eventIdSchema } from "../../modules/events/event.validation";
import { draftMarketingBodySchema } from "../../modules/marketing/marketing.validation";
import { runTool } from "../tool-result";

export function registerDraftMarketingMessageTool(
  server: McpServer,
  { marketingService }: Services,
): void {
  const config = MCP_TOOLS_CONFIG.draftMarketingMessage;
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
        marketingService.draftMessage(
          eventIdSchema.parse(event_id),
          draftMarketingBodySchema.parse(rest),
        ),
      ),
  );
}
