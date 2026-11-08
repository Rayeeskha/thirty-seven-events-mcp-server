import { z } from 'zod';
import { eventIdSchema } from '../events/event.validation';
import { MARKETING_CHANNELS, MARKETING_LANGUAGES } from './marketing.types';

export const draftMarketingBodyShape = {
  channel: z.enum(MARKETING_CHANNELS).describe('INSTAGRAM_POST or EMAIL'),
  language: z.enum(MARKETING_LANGUAGES).default('EN').describe('EN, AR, or BOTH (English and Arabic)'),
};

export const draftMarketingBodySchema = z.object(draftMarketingBodyShape);

export const draftMarketingShape = {
  event_id: eventIdSchema.describe('ID of the event to write marketing content for'),
  ...draftMarketingBodyShape,
};

export type DraftMarketingBody = z.infer<typeof draftMarketingBodySchema>;
