import { ConflictError, NotFoundError } from "../../utils/errors";
import { ERROR_MESSAGES } from "../../config/messages";
import { toEventDto } from "./event.mapper";
import { EventRepository, WriteOptions } from "./event.repository";
import { EventDto, EventStatus, PaginatedEvents } from "./event.types";
import { CreateEventInput, SearchEventsInput } from "./event.validation";

export class EventService {
  constructor(private readonly eventRepository: EventRepository) {}

  async searchEvents(criteria: SearchEventsInput): Promise<PaginatedEvents> {
    const { rows, total } = await this.eventRepository.search(criteria);
    return {
      data: rows.map(toEventDto),
      pagination: { total, limit: criteria.limit, offset: criteria.offset },
    };
  }

  async getEventById(id: number): Promise<EventDto> {
    const event = await this.eventRepository.findById(id);
    if (!event) throw new NotFoundError("Event", id);
    return toEventDto(event);
  }

  /** Persists a new event. Callers must have obtained confirmation first (see ConfirmationService). */
  async createEvent(
    input: CreateEventInput,
    options: WriteOptions = {},
  ): Promise<EventDto> {
    const event = await this.eventRepository.create(input, options);
    return toEventDto(event);
  }

  /** Persists a status change. Callers must have obtained confirmation first (see ConfirmationService). */
  async updateEventStatus(
    id: number,
    status: EventStatus,
    options: WriteOptions & { expectedCurrentStatus?: EventStatus } = {},
  ): Promise<EventDto> {
    const event = await this.eventRepository.findById(id, {
      transaction: options.transaction,
      lock: true,
    });
    if (!event) throw new NotFoundError("Event", id);
    if (
      options.expectedCurrentStatus &&
      event.status !== options.expectedCurrentStatus
    ) {
      throw new ConflictError(
        ERROR_MESSAGES.eventStatusChanged(
          id,
          event.status,
          options.expectedCurrentStatus,
        ),
      );
    }
    const updated = await this.eventRepository.updateStatus(event, status, {
      transaction: options.transaction,
    });
    return toEventDto(updated);
  }
}
