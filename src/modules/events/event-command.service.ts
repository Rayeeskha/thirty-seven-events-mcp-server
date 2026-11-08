import { z } from 'zod';
import { TransactionRunner } from '../../database/transaction';
import { ConflictError } from '../../utils/errors';
import { ConfirmationService } from '../confirmation/confirmation.service';
import { ConfirmationRequired } from '../confirmation/confirmation.types';
import { confirmationInstructions, summarizeCreateEvent, summarizeStatusChange } from './event-command.summaries';
import { EventService } from './event.service';
import { EventDto, EventStatus } from './event.types';
import { CreateEventInput, CreateEventRequest, eventStatusSchema, UpdateEventStatusRequest } from './event.validation';

export interface EventCreated {
  outcome: 'EXECUTED';
  operation: 'CREATE_EVENT';
  event: EventDto;
}

export interface EventStatusUpdated {
  outcome: 'EXECUTED';
  operation: 'UPDATE_EVENT_STATUS';
  event: EventDto;
}

export type CreateEventResult = ConfirmationRequired<CreateEventInput> | EventCreated;

export interface StatusChangeProposal {
  event_id: number;
  status: EventStatus;
}

export type UpdateEventStatusResult = ConfirmationRequired<StatusChangeProposal> | EventStatusUpdated;

const statusChangeSnapshotSchema = z.object({
  event_id: z.number(),
  status: eventStatusSchema,
  previous_status: eventStatusSchema,
});

/**
 * Event writes behind the two-step confirmation workflow. Without a confirmation token a call only
 * records a proposal; the database is modified solely when a valid, matching, unused token is presented.
 */
export class EventCommandService {
  constructor(
    private readonly eventService: EventService,
    private readonly confirmationService: ConfirmationService,
    private readonly runInTransaction: TransactionRunner,
  ) {}

  async createEvent(request: CreateEventRequest): Promise<CreateEventResult> {
    const { confirmation_token: token, ...params } = request;
    return token ? this.executeCreate(params, token) : this.proposeCreate(params);
  }

  async updateEventStatus(eventId: number, request: UpdateEventStatusRequest): Promise<UpdateEventStatusResult> {
    const { confirmation_token: token, status } = request;
    return token
      ? this.executeStatusUpdate({ event_id: eventId, status }, token)
      : this.proposeStatusUpdate({ event_id: eventId, status });
  }

  private async proposeCreate(params: CreateEventInput): Promise<ConfirmationRequired<CreateEventInput>> {
    const { token, expiresAt } = await this.confirmationService.issue({
      operation: 'CREATE_EVENT',
      boundParams: params,
      snapshot: params,
    });
    return {
      outcome: 'CONFIRMATION_REQUIRED',
      operation: 'CREATE_EVENT',
      summary: summarizeCreateEvent(params),
      proposed: params,
      confirmation_token: token,
      expires_at: expiresAt.toISOString(),
      instructions: confirmationInstructions(expiresAt),
    };
  }

  private executeCreate(params: CreateEventInput, token: string): Promise<EventCreated> {
    return this.runInTransaction(async (transaction) => {
      await this.confirmationService.consume(
        { token, operation: 'CREATE_EVENT', boundParams: params },
        transaction,
      );
      const event = await this.eventService.createEvent(params, { transaction });
      return { outcome: 'EXECUTED', operation: 'CREATE_EVENT', event };
    });
  }

  private async proposeStatusUpdate(
    params: StatusChangeProposal,
  ): Promise<ConfirmationRequired<StatusChangeProposal>> {
    const event = await this.eventService.getEventById(params.event_id);
    if (event.status === params.status) {
      throw new ConflictError(`Event ${event.id} already has status ${event.status}`);
    }
    const { token, expiresAt } = await this.confirmationService.issue({
      operation: 'UPDATE_EVENT_STATUS',
      boundParams: params,
      snapshot: { ...params, previous_status: event.status },
    });
    return {
      outcome: 'CONFIRMATION_REQUIRED',
      operation: 'UPDATE_EVENT_STATUS',
      summary: summarizeStatusChange(event, params.status),
      proposed: params,
      confirmation_token: token,
      expires_at: expiresAt.toISOString(),
      instructions: confirmationInstructions(expiresAt),
    };
  }

  private executeStatusUpdate(params: StatusChangeProposal, token: string): Promise<EventStatusUpdated> {
    return this.runInTransaction(async (transaction) => {
      const snapshot = await this.confirmationService.consume(
        { token, operation: 'UPDATE_EVENT_STATUS', boundParams: params },
        transaction,
      );
      const { previous_status } = statusChangeSnapshotSchema.parse(snapshot);
      const event = await this.eventService.updateEventStatus(params.event_id, params.status, {
        transaction,
        expectedCurrentStatus: previous_status,
      });
      return { outcome: 'EXECUTED', operation: 'UPDATE_EVENT_STATUS', event };
    });
  }
}
