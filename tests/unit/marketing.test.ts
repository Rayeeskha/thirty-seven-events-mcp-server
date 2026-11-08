import { describe, expect, it } from '@jest/globals';
import { EventDto } from '../../src/modules/events/event.types';
import { EventService } from '../../src/modules/events/event.service';
import { MarketingChannel, MarketingContext } from '../../src/modules/marketing/marketing.types';
import { MarketingService } from '../../src/modules/marketing/marketing.service';
import { composeArabic } from '../../src/modules/marketing/templates/ar';
import { buildMarketingContext, formatEventDate } from '../../src/modules/marketing/templates/context';
import { composeEnglish } from '../../src/modules/marketing/templates/en';
import { ValidationError } from '../../src/utils/errors';

const event = (overrides: Partial<EventDto> = {}): EventDto => ({
  id: 1,
  event_name: 'Riyadh Season Pop-Up Showcase',
  event_date: '2026-12-04',
  client: 'Najd Telecom',
  budget: 670000,
  status: 'PLANNED',
  number_of_projects: 4,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('formatEventDate', () => {
  it.each([
    ['2026-12-04', 'Friday, 4 December 2026'],
    ['2026-12-31', 'Thursday, 31 December 2026'],
    ['2027-01-01', 'Friday, 1 January 2027'],
    ['2028-02-29', 'Tuesday, 29 February 2028'],
  ])('formats %s in English', (isoDate, expected) => {
    expect(formatEventDate(isoDate, 'EN')).toBe(expected);
  });

  it('formats Arabic dates with Gregorian month names', () => {
    expect(formatEventDate('2026-12-04', 'AR')).toContain('ديسمبر');
    expect(formatEventDate('2027-01-01', 'AR')).toContain('يناير');
  });

  it('does not depend on the server time zone', () => {
    const original = process.env.TZ;
    try {
      for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Riyadh']) {
        process.env.TZ = zone;
        expect(formatEventDate('2026-12-04', 'EN')).toBe('Friday, 4 December 2026');
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe('buildMarketingContext hashtags', () => {
  const tags = (eventName: string) => buildMarketingContext(event({ event_name: eventName }) as EventDto & { status: 'PLANNED' }, 'EN').hashtags;

  it('builds a CamelCase hashtag from the event name plus the brand tag', () => {
    expect(tags('Riyadh Season Pop-Up Showcase')).toBe('#RiyadhSeasonPopUpShowcase #ThirtySevenEvents');
  });

  it('removes punctuation and symbols', () => {
    expect(tags('Saudi Tech Expo 2027!')).toBe('#SaudiTechExpo2027 #ThirtySevenEvents');
    expect(tags('R&D #1: "Summit"')).toBe('#RD1Summit #ThirtySevenEvents');
  });

  it('keeps Arabic letters', () => {
    expect(tags('معرض الرياض')).toBe('#معرضالرياض #ThirtySevenEvents');
  });

  it('falls back to the brand tag when nothing usable remains', () => {
    expect(tags('!!! ???')).toBe('#ThirtySevenEvents');
  });
});

describe('message templates', () => {
  const statuses: MarketingContext['status'][] = ['PLANNED', 'IN_PROGRESS', 'COMPLETED'];
  const channels: MarketingChannel[] = ['INSTAGRAM_POST', 'EMAIL'];
  const context = (status: MarketingContext['status'], language: 'EN' | 'AR'): MarketingContext =>
    buildMarketingContext(event({ status }) as EventDto & { status: MarketingContext['status'] }, language);

  describe.each([
    ['English', composeEnglish, 'EN'],
    ['Arabic', composeArabic, 'AR'],
  ] as const)('%s', (_name, compose, language) => {
    it.each(statuses.flatMap((status) => channels.map((channel) => [status, channel] as const)))('%s / %s uses only the event\'s own facts', (status, channel) => {
      const ctx = context(status, language);
      const { subject, body } = compose(ctx, channel);
      const text = `${subject ?? ''}\n${body}`;

      expect(body.trim().length).toBeGreaterThan(40);
      expect(text).toContain(ctx.eventName);
      expect(text).toContain(ctx.dateLabel);
      expect(text).toContain(ctx.client);
      expect(text).not.toMatch(/undefined|null|\$\{|\[object/);
      expect(text).not.toMatch(/670[,.]?000|SAR|budget/i);
      expect(subject === undefined).toBe(channel === 'INSTAGRAM_POST');
    });

    it('marks an in-progress event differently from a planned one', () => {
      expect(compose(context('IN_PROGRESS', language), 'INSTAGRAM_POST').body).not.toBe(compose(context('PLANNED', language), 'INSTAGRAM_POST').body);
    });

    it('adds hashtags to Instagram posts only', () => {
      expect(compose(context('PLANNED', language), 'INSTAGRAM_POST').body).toContain('#ThirtySevenEvents');
      expect(compose(context('PLANNED', language), 'EMAIL').body).not.toContain('#');
    });
  });

  it('does not invent a registration link, venue, price or contact detail', () => {
    for (const compose of [composeEnglish, composeArabic]) {
      for (const status of statuses) {
        for (const channel of channels) {
          const language = compose === composeEnglish ? 'EN' : 'AR';
          const { body } = compose(context(status, language), channel);
          expect(body).not.toMatch(/https?:\/\/|www\.|@\w+\.\w+|\+966|tickets?|register|venue|RSVP/i);
        }
      }
    }
  });
});

describe('MarketingService', () => {
  const serviceFor = (found: EventDto) => {
    const calls: number[] = [];
    const stub = { getEventById: async (id: number) => (calls.push(id), found) } as unknown as EventService;
    return { service: new MarketingService(stub), calls };
  };

  it('looks the event up once and returns drafts in EN, AR order for BOTH', async () => {
    const { service, calls } = serviceFor(event({ id: 10 }));
    const result = await service.draftMessage(10, { channel: 'EMAIL', language: 'BOTH' });
    expect(calls).toEqual([10]);
    expect(result.drafts.map((draft) => draft.language)).toEqual(['EN', 'AR']);
    expect(result).toMatchObject({ event_id: 10, event_name: 'Riyadh Season Pop-Up Showcase', event_status: 'PLANNED', channel: 'EMAIL' });
  });

  it('rejects a cancelled event with a validation error that names the event', async () => {
    const { service } = serviceFor(event({ id: 4, status: 'CANCELLED' }));
    await expect(service.draftMessage(4, { channel: 'EMAIL', language: 'EN' })).rejects.toThrow(ValidationError);
    await expect(service.draftMessage(4, { channel: 'EMAIL', language: 'EN' })).rejects.toMatchObject({
      details: [{ path: 'event_id', message: 'Event 4 is CANCELLED' }],
    });
  });
});
