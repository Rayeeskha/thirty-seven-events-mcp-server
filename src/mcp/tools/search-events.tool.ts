import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Services } from '../../container';
import { searchEventsSchema, searchEventsShape } from '../../modules/events/event.validation';
import { runTool } from '../tool-result';

export function registerSearchEventsTool(server: McpServer, { eventService }: Services): void {
  server.registerTool(
    'search_events',
    {
      title: 'Search events',
      description:
        'Search Thirty Seven Events by event date, client and/or status. All filters are optional and combine with AND. ' +
        'event_date matches one exact day; date_from/date_to give a range. client is a case-insensitive partial match. ' +
        'Returns matching events ordered by date, with pagination info.',
      inputSchema: searchEventsShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(() => eventService.searchEvents(searchEventsSchema.parse(args))),
  );
}
