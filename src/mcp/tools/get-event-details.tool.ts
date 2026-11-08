import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Services } from '../../container';
import { eventIdSchema } from '../../modules/events/event.validation';
import { runTool } from '../tool-result';

export function registerGetEventDetailsTool(server: McpServer, { eventService }: Services): void {
  server.registerTool(
    'get_event_details',
    {
      title: 'Get event details',
      description: 'Retrieve all stored information about one event (name, date, client, budget in SAR, status, number of projects, timestamps) by its ID.',
      inputSchema: { event_id: eventIdSchema.describe('ID of the event') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ event_id }) => runTool(() => eventService.getEventById(eventIdSchema.parse(event_id))),
  );
}
