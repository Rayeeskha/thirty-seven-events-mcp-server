import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Services } from '../../container';
import { confirmationTokenShape } from '../../modules/confirmation/confirmation.validation';
import {
  eventIdSchema,
  updateEventStatusRequestSchema,
  updateEventStatusShape,
} from '../../modules/events/event.validation';
import { runTool } from '../tool-result';

export function registerUpdateEventStatusTool(server: McpServer, { eventCommandService }: Services): void {
  server.registerTool(
    'update_event_status',
    {
      title: 'Update event status',
      description:
        'Change the status of an existing event (PLANNED, IN_PROGRESS, COMPLETED, CANCELLED). ' +
        'This is a TWO-STEP operation that requires the user\'s explicit confirmation. ' +
        'Step 1: call WITHOUT confirmation_token. Nothing is changed; you receive a summary and a confirmation_token. ' +
        'Show the summary to the user and ask whether to proceed. ' +
        'Step 2: only after the user explicitly confirms, call again with exactly the same event_id and status plus the confirmation_token. ' +
        'Never confirm on the user\'s behalf. Tokens are single-use, expire, and are rejected if any parameter changed.',
      inputSchema: {
        event_id: eventIdSchema.describe('ID of the event to update'),
        ...updateEventStatusShape,
        ...confirmationTokenShape,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    ({ event_id, ...rest }) =>
      runTool(() =>
        eventCommandService.updateEventStatus(eventIdSchema.parse(event_id), updateEventStatusRequestSchema.parse(rest)),
      ),
  );
}
