export const EVENT_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Shape returned by the REST API and MCP tools. Field names match the database columns. */
export interface EventDto {
  id: number;
  event_name: string;
  event_date: string;
  client: string;
  budget: number;
  status: EventStatus;
  number_of_projects: number;
  created_at: string;
  updated_at: string;
}

export interface PaginatedEvents {
  data: EventDto[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}
