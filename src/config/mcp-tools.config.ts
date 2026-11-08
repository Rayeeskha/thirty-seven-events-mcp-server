import {
  eventIdSchema,
  searchEventsShape,
  createEventShape,
  updateEventStatusShape,
} from "../modules/events/event.validation";
import { confirmationTokenShape } from "../modules/confirmation/confirmation.validation";
import { draftMarketingShape } from "../modules/marketing/marketing.validation";

export const MCP_SERVER_CONFIG = {
  name: "thirty-seven-events",
  version: "1.0.0",
  instructions:
    "Tools for managing Thirty Seven Events data. Adding an event or changing an event's status always requires " +
    "the user's explicit confirmation: first call the tool without a confirmation_token, show the returned summary " +
    "to the user and ask whether to proceed, and call again with the token only after the user clearly says yes. " +
    "Never assume confirmation.",
} as const;

export const MCP_TOOLS_CONFIG = {
  searchEvents: {
    name: "search_events",
    title: "Search events",
    description:
      "Search Thirty Seven Events by event date, client and/or status. All filters are optional and combine with AND. " +
      "event_date matches one exact day; date_from/date_to give a range. client is a case-insensitive partial match. " +
      "Returns matching events ordered by date, with pagination info.",
    inputSchema: searchEventsShape,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  getEventDetails: {
    name: "get_event_details",
    title: "Get event details",
    description:
      "Retrieve all stored information about one event (name, date, client, budget in SAR, status, number of projects, timestamps) by its ID.",
    inputSchema: { event_id: eventIdSchema.describe("ID of the event") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  addEvent: {
    name: "add_event",
    title: "Add event",
    description:
      "Create a new event. This is a TWO-STEP operation that requires the user's explicit confirmation. " +
      "Step 1: call WITHOUT confirmation_token. Nothing is saved; you receive a summary and a confirmation_token. " +
      "Show the summary to the user and ask whether to proceed. " +
      "Step 2: only after the user explicitly confirms, call again with exactly the same parameters plus the confirmation_token. " +
      "Never confirm on the user's behalf. Tokens are single-use, expire, and are rejected if any parameter changed. " +
      "Required: event_name, event_date (YYYY-MM-DD), client, budget (SAR). Optional: number_of_projects (default 0), status (default PLANNED).",
    inputSchema: { ...createEventShape, ...confirmationTokenShape },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  updateEventStatus: {
    name: "update_event_status",
    title: "Update event status",
    description:
      "Change the status of an existing event (PLANNED, IN_PROGRESS, COMPLETED, CANCELLED). " +
      "This is a TWO-STEP operation that requires the user's explicit confirmation. " +
      "Step 1: call WITHOUT confirmation_token. Nothing is changed; you receive a summary and a confirmation_token. " +
      "Show the summary to the user and ask whether to proceed. " +
      "Step 2: only after the user explicitly confirms, call again with exactly the same event_id and status plus the confirmation_token. " +
      "Never confirm on the user's behalf. Tokens are single-use, expire, and are rejected if any parameter changed.",
    inputSchema: {
      event_id: eventIdSchema.describe("ID of the event to update"),
      ...updateEventStatusShape,
      ...confirmationTokenShape,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  draftMarketingMessage: {
    name: "draft_marketing_message",
    title: "Draft marketing message",
    description:
      "Generate marketing copy for an event using only the details stored in the database (name, date, client, status). " +
      "channel: INSTAGRAM_POST or EMAIL. language: EN, AR, or BOTH. Cannot be used for CANCELLED events. " +
      "This only drafts text; it does not publish or send anything and does not modify the event.",
    inputSchema: draftMarketingShape,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
} as const;
