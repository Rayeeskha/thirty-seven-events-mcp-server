/** The input schemas are the second line of defence behind the MCP SDK's own validation, so they are tested directly. */
import { describe, expect, it } from '@jest/globals';
import {
  createEventRequestSchema,
  eventIdSchema,
  searchEventsSchema,
  updateEventStatusRequestSchema,
} from '../../src/modules/events/event.validation';
import { draftMarketingBodySchema } from '../../src/modules/marketing/marketing.validation';

const VALID_EVENT = { event_name: 'Saudi Tech Expo', event_date: '2027-05-10', client: 'Kingdom Fintech Council', budget: 310500.5 };

describe('createEventRequestSchema', () => {
  it('applies defaults for the optional fields', () => {
    expect(createEventRequestSchema.parse(VALID_EVENT)).toEqual({ ...VALID_EVENT, number_of_projects: 0, status: 'PLANNED' });
  });

  it('drops fields it does not own instead of passing them on', () => {
    const parsed = createEventRequestSchema.parse({ ...VALID_EVENT, id: 999, created_at: '1999-01-01', is_admin: true });
    expect(Object.keys(parsed).sort()).toEqual(['budget', 'client', 'event_date', 'event_name', 'number_of_projects', 'status']);
  });

  it('trims surrounding whitespace', () => {
    const parsed = createEventRequestSchema.parse({ ...VALID_EVENT, event_name: '  Padded  ', client: ' Najd Telecom ' });
    expect(parsed).toMatchObject({ event_name: 'Padded', client: 'Najd Telecom' });
  });

  it('keeps an optional confirmation token', () => {
    expect(createEventRequestSchema.parse({ ...VALID_EVENT, confirmation_token: 'abc' }).confirmation_token).toBe('abc');
  });

  it.each([
    ['a missing name', { event_name: undefined }],
    ['a blank name', { event_name: '   ' }],
    ['a name over 255 characters', { event_name: 'x'.repeat(256) }],
    ['a missing client', { client: undefined }],
    ['an impossible date', { event_date: '2027-02-30' }],
    ['a date in the wrong format', { event_date: '10/05/2027' }],
    ['a negative budget', { budget: -1 }],
    ['a budget as text', { budget: '100' }],
    ['a budget with three decimals', { budget: 1.234 }],
    ['a budget above the column limit', { budget: 10_000_000_000 }],
    ['a negative project count', { number_of_projects: -1 }],
    ['a fractional project count', { number_of_projects: 1.5 }],
    ['an unknown status', { status: 'DONE' }],
    ['an empty confirmation token', { confirmation_token: '   ' }],
  ])('rejects %s', (_label, override) => {
    expect(createEventRequestSchema.safeParse({ ...VALID_EVENT, ...override }).success).toBe(false);
  });
});

describe('updateEventStatusRequestSchema', () => {
  it.each(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])('accepts %s', (status) => {
    expect(updateEventStatusRequestSchema.parse({ status })).toEqual({ status });
  });

  it.each([{}, { status: 'DONE' }, { status: 'planned' }, { status: 1 }])('rejects %j', (input) => {
    expect(updateEventStatusRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe('searchEventsSchema', () => {
  it('has all filters optional, with paging defaults', () => {
    expect(searchEventsSchema.parse({})).toEqual({ limit: 20, offset: 0 });
  });

  it('accepts every filter together', () => {
    const input = { event_date: '2026-12-04', date_from: '2026-11-01', date_to: '2026-12-31', client: 'Najd', status: 'PLANNED', limit: 5, offset: 10 };
    expect(searchEventsSchema.parse(input)).toEqual(input);
  });

  it('rejects a range that ends before it starts, but accepts a one-day range', () => {
    expect(searchEventsSchema.safeParse({ date_from: '2027-01-02', date_to: '2027-01-01' }).success).toBe(false);
    expect(searchEventsSchema.safeParse({ date_from: '2027-01-01', date_to: '2027-01-01' }).success).toBe(true);
  });

  it.each([{ limit: 0 }, { limit: 101 }, { offset: -1 }, { limit: 1.5 }, { status: 'DONE' }, { client: '' }, { event_date: '2026-13-01' }])('rejects %j', (input) => {
    expect(searchEventsSchema.safeParse(input).success).toBe(false);
  });
});

describe('eventIdSchema', () => {
  it('accepts positive whole numbers, given as numbers or numeric text', () => {
    expect(eventIdSchema.parse(8)).toBe(8);
    expect(eventIdSchema.parse('8')).toBe(8);
  });

  it.each([0, -3, 1.5, 'abc', '', null])('rejects %p', (input) => {
    expect(eventIdSchema.safeParse(input).success).toBe(false);
  });
});

describe('draftMarketingBodySchema', () => {
  it('defaults the language to English', () => {
    expect(draftMarketingBodySchema.parse({ channel: 'EMAIL' })).toEqual({ channel: 'EMAIL', language: 'EN' });
  });

  it.each(['EN', 'AR', 'BOTH'])('accepts language %s', (language) => {
    expect(draftMarketingBodySchema.parse({ channel: 'INSTAGRAM_POST', language }).language).toBe(language);
  });

  it.each([{}, { channel: 'TWITTER' }, { channel: 'EMAIL', language: 'FR' }])('rejects %j', (input) => {
    expect(draftMarketingBodySchema.safeParse(input).success).toBe(false);
  });
});
