import { EventModel } from '../../database/models/event.model';
import { EventDto } from './event.types';

export function toEventDto(event: EventModel): EventDto {
  return {
    id: event.id,
    event_name: event.event_name,
    event_date: event.event_date,
    client: event.client,
    budget: event.budget,
    status: event.status,
    number_of_projects: event.number_of_projects,
    created_at: event.created_at.toISOString(),
    updated_at: event.updated_at.toISOString(),
  };
}
