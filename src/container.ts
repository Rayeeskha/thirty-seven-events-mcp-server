import { env } from './config/env';
import { runInTransaction } from './database/transaction';
import { PendingOperationRepository } from './modules/confirmation/confirmation.repository';
import { Clock, ConfirmationService } from './modules/confirmation/confirmation.service';
import { EventCommandService } from './modules/events/event-command.service';
import { EventRepository } from './modules/events/event.repository';
import { EventService } from './modules/events/event.service';
import { MarketingService } from './modules/marketing/marketing.service';

export interface Services {
  eventService: EventService;
  eventCommandService: EventCommandService;
  marketingService: MarketingService;
}

export interface BuildServicesOptions {
  clock?: Clock;
  confirmationTtlSeconds?: number;
}

/** Composition root: the only place concrete classes are wired together. */
export function buildServices(options: BuildServicesOptions = {}): Services {
  const eventService = new EventService(new EventRepository());
  const confirmationService = new ConfirmationService(
    new PendingOperationRepository(),
    options.confirmationTtlSeconds ?? env.CONFIRMATION_TTL_SECONDS,
    options.clock,
  );
  return {
    eventService,
    eventCommandService: new EventCommandService(eventService, confirmationService, runInTransaction),
    marketingService: new MarketingService(eventService),
  };
}
