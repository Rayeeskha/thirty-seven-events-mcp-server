import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Services } from '../../container';
import { eventIdSchema } from '../../modules/events/event.validation';
import { draftMarketingBodySchema, draftMarketingShape } from '../../modules/marketing/marketing.validation';
import { runTool } from '../tool-result';

export function registerDraftMarketingMessageTool(server: McpServer, { marketingService }: Services): void {
  server.registerTool(
    'draft_marketing_message',
    {
      title: 'Draft marketing message',
      description:
        'Generate marketing copy for an event using only the details stored in the database (name, date, client, status). ' +
        'channel: INSTAGRAM_POST or EMAIL. language: EN, AR, or BOTH. Cannot be used for CANCELLED events. ' +
        'This only drafts text; it does not publish or send anything and does not modify the event.',
      inputSchema: draftMarketingShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ event_id, ...rest }) =>
      runTool(() => marketingService.draftMessage(eventIdSchema.parse(event_id), draftMarketingBodySchema.parse(rest))),
  );
}
