import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CreateEventResult, UpdateEventStatusResult } from '../../src/modules/events/event-command.service';
import { EventDto, PaginatedEvents } from '../../src/modules/events/event.types';
import { MarketingDraftResult } from '../../src/modules/marketing/marketing.types';

export type Result<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

export type Params = Record<string, unknown>;

interface ErrorBody {
  error?: { code?: string; message?: string };
}

/** Thin wrapper over the official SDK client that turns tool results into typed values. */
export class McpDriver {
  private constructor(readonly client: Client) {}

  static async connect(mcpUrl: string): Promise<McpDriver> {
    const client = new Client({ name: 'thirty-seven-events-tests', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));
    return new McpDriver(client);
  }

  close(): Promise<void> {
    return this.client.close();
  }

  searchEvents(filters: Params): Promise<Result<PaginatedEvents>> {
    return this.call('search_events', filters);
  }

  getEventDetails(id: number): Promise<Result<EventDto>> {
    return this.call('get_event_details', { event_id: id });
  }

  addEvent(input: Params): Promise<Result<CreateEventResult>> {
    return this.call('add_event', input);
  }

  updateEventStatus(id: number, input: Params): Promise<Result<UpdateEventStatusResult>> {
    return this.call('update_event_status', { event_id: id, ...input });
  }

  draftMarketingMessage(id: number, input: Params): Promise<Result<MarketingDraftResult>> {
    return this.call('draft_marketing_message', { event_id: id, ...input });
  }

  /** Raw tool call, for tests that care about MCP-level details such as isError. */
  async callRaw(name: string, args: Params): Promise<{ isError: boolean; text: string }> {
    const result = await this.client.callTool({ name, arguments: args });
    const [first] = result.content as { type: string; text: string }[];
    return { isError: Boolean(result.isError), text: first.text };
  }

  private async call<T>(name: string, args: Params): Promise<Result<T>> {
    const { isError, text } = await this.callRaw(name, args);
    if (!isError) return { ok: true, value: JSON.parse(text) as T };
    try {
      const { error } = JSON.parse(text) as ErrorBody;
      return { ok: false, code: error?.code ?? 'MCP_ERROR', message: error?.message ?? text };
    } catch {
      // Rejected by the SDK's own input-schema validation before reaching a handler.
      return { ok: false, code: 'MCP_INPUT_VALIDATION', message: text };
    }
  }
}
