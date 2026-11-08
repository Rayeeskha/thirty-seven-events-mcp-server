import { EventDto } from '../../events/event.types';
import { DraftLanguage, MarketingContext } from '../marketing.types';

const DATE_LOCALES: Record<DraftLanguage, string> = {
  EN: 'en-GB',
  AR: 'ar-SA-u-ca-gregory',
};

const BRAND_HASHTAG = '#ThirtySevenEvents';

export function formatEventDate(isoDate: string, language: DraftLanguage): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat(DATE_LOCALES[language], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function buildEventHashtag(eventName: string): string {
  const words = eventName
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? `#${words.join('')}` : '';
}

export function buildMarketingContext(
  event: EventDto & { status: MarketingContext['status'] },
  language: DraftLanguage,
): MarketingContext {
  return {
    eventName: event.event_name,
    client: event.client,
    dateLabel: formatEventDate(event.event_date, language),
    hashtags: [buildEventHashtag(event.event_name), BRAND_HASHTAG].filter(Boolean).join(' '),
    status: event.status,
  };
}
