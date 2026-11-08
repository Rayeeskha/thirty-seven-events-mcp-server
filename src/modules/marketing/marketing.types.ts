import { EventStatus } from '../events/event.types';

export const MARKETING_CHANNELS = ['INSTAGRAM_POST', 'EMAIL'] as const;
export const MARKETING_LANGUAGES = ['EN', 'AR', 'BOTH'] as const;

export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];
export type MarketingLanguage = (typeof MARKETING_LANGUAGES)[number];
export type DraftLanguage = Exclude<MarketingLanguage, 'BOTH'>;

export interface MarketingDraft {
  language: DraftLanguage;
  channel: MarketingChannel;
  subject?: string;
  body: string;
}

export interface MarketingDraftResult {
  event_id: number;
  event_name: string;
  event_status: EventStatus;
  channel: MarketingChannel;
  drafts: MarketingDraft[];
}

/** Only event facts stored in the database; nothing here is invented. */
export interface MarketingContext {
  eventName: string;
  client: string;
  dateLabel: string;
  hashtags: string;
  status: Exclude<EventStatus, 'CANCELLED'>;
}
