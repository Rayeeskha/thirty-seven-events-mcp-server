import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Services } from '../../container';
import { registerAddEventTool } from './add-event.tool';
import { registerDraftMarketingMessageTool } from './draft-marketing-message.tool';
import { registerGetEventDetailsTool } from './get-event-details.tool';
import { registerSearchEventsTool } from './search-events.tool';
import { registerUpdateEventStatusTool } from './update-event-status.tool';

export function registerTools(server: McpServer, services: Services): void {
  registerSearchEventsTool(server, services);
  registerGetEventDetailsTool(server, services);
  registerAddEventTool(server, services);
  registerUpdateEventStatusTool(server, services);
  registerDraftMarketingMessageTool(server, services);
}
