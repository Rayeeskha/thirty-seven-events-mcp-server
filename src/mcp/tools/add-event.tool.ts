import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Services } from '../../container';
import { confirmationTokenShape } from '../../modules/confirmation/confirmation.validation';
import { createEventRequestSchema, createEventShape } from '../../modules/events/event.validation';
import { runTool } from '../tool-result';

export function registerAddEventTool(server: McpServer, { eventCommandService }: Services): void {
  server.registerTool(
    'add_event',
    {
      title: 'Add event',
      description:
        'Create a new event. This is a TWO-STEP operation that requires the user\'s explicit confirmation. ' +
        'Step 1: call WITHOUT confirmation_token. Nothing is saved; you receive a summary and a confirmation_token. ' +
        'Show the summary to the user and ask whether to proceed. ' +
        'Step 2: only after the user explicitly confirms, call again with exactly the same parameters plus the confirmation_token. ' +
        'Never confirm on the user\'s behalf. Tokens are single-use, expire, and are rejected if any parameter changed. ' +
        'Required: event_name, event_date (YYYY-MM-DD), client, budget (SAR). Optional: number_of_projects (default 0), status (default PLANNED).',
      inputSchema: { ...createEventShape, ...confirmationTokenShape },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) => runTool(() => eventCommandService.createEvent(createEventRequestSchema.parse(args))),
  );
}
