import { z } from 'zod';
import { isValidIsoDate } from '../../utils/date';
import { confirmationTokenShape } from '../confirmation/confirmation.validation';
import { EVENT_STATUSES } from './event.types';

const MAX_BUDGET = 9_999_999_999.99; // DECIMAL(12,2)

export const isoDateSchema = z
  .string()
  .refine(isValidIsoDate, { message: 'Must be a valid date in YYYY-MM-DD format' })
  .meta({ format: 'date', examples: ['2026-12-04'] });

export const eventStatusSchema = z.enum(EVENT_STATUSES);

export const eventIdSchema = z.coerce
  .number({ error: 'id must be a positive integer' })
  .int('id must be a positive integer')
  .positive('id must be a positive integer')
  .safe();

/** Plain shape so the MCP SDK can reuse it as a tool input schema. */
export const searchEventsShape = {
  event_date: isoDateSchema.describe('Only events on exactly this date (YYYY-MM-DD)').optional(),
  date_from: isoDateSchema.describe('Only events on or after this date (YYYY-MM-DD)').optional(),
  date_to: isoDateSchema
    .describe('Only events on or before this date (YYYY-MM-DD). Must not be earlier than date_from')
    .optional(),
  client: z.string().trim().min(1).max(150).describe('Case-insensitive partial match on the client name').optional(),
  status: eventStatusSchema.describe('Only events with this status').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe('Page size (1-100)'),
  offset: z.coerce.number().int().min(0).default(0).describe('Number of events to skip'),
};

export const searchEventsSchema = z.object(searchEventsShape).refine(
  ({ date_from, date_to }) => !date_from || !date_to || date_from <= date_to,
  { message: 'date_from must not be after date_to', path: ['date_from'] },
);

export const createEventShape = {
  event_name: z.string().trim().min(1).max(255).describe('Name of the event').meta({ examples: ['Saudi Tech Expo'] }),
  event_date: isoDateSchema.describe('Date of the event (YYYY-MM-DD)'),
  client: z.string().trim().min(1).max(150).describe('Client the event is produced for').meta({ examples: ['Kingdom Fintech Council'] }),
  budget: z
    .number()
    .finite()
    .nonnegative()
    .max(MAX_BUDGET)
    .multipleOf(0.01)
    .describe('Budget in Saudi riyals (SAR), up to 2 decimal places')
    .meta({ examples: [310500.5] }),
  number_of_projects: z.number().int().min(0).max(100_000).default(0).describe('Number of projects within the event'),
  status: eventStatusSchema.default('PLANNED').describe('Initial status'),
};

export const createEventSchema = z.object(createEventShape);

export const updateEventStatusShape = {
  status: eventStatusSchema.describe('The new status'),
};

export const createEventRequestSchema = createEventSchema.extend(confirmationTokenShape);

export const updateEventStatusRequestSchema = z.object({
  ...updateEventStatusShape,
  ...confirmationTokenShape,
});

export type SearchEventsInput = z.infer<typeof searchEventsSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type CreateEventRequest = z.infer<typeof createEventRequestSchema>;
export type UpdateEventStatusRequest = z.infer<typeof updateEventStatusRequestSchema>;
