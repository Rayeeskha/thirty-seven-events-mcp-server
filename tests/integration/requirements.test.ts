/**
 * The client's requirements, each verified through the MCP tools with the official SDK client.
 * Numbering follows the Testing section of the assignment.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { EventModel } from '../../src/database/models/event.model';
import { CONFIRMATION_TTL_SECONDS, Harness, startHarness } from '../helpers/harness';
import {
  countConsumedOperations,
  countEvents,
  countEventsNamed,
  countPendingOperations,
  findEventRow,
  resetDatabase,
} from '../helpers/database';
import { McpDriver } from '../helpers/drivers';
import {
  confirmCreate,
  confirmStatus,
  expectRejected,
  NEW_EVENT,
  proposeCreate,
  proposeStatus,
  unwrap,
  VALIDATION_REJECTION,
} from '../helpers/flows';

const ids = (events: { id: number }[]): number[] => events.map((event) => event.id);

describe('MCP', () => {
  let harness: Harness;
  const driver = (): McpDriver => harness.mcp;

  beforeAll(async () => {
    harness = await startHarness();
  });
  afterAll(async () => {
    await harness.close();
  });
  beforeEach(async () => {
    harness.clock.reset();
    await resetDatabase();
  });

  describe('1. Searching events by date', () => {
    it('finds the event on an exact date', async () => {
      const { data, pagination } = unwrap(await driver().searchEvents({ event_date: '2026-12-04' }));
      expect(ids(data)).toEqual([10]);
      expect(data[0].event_name).toBe('Riyadh Season Pop-Up Showcase');
      expect(pagination.total).toBe(1);
    });

    it('returns nothing for a date with no events', async () => {
      const { data, pagination } = unwrap(await driver().searchEvents({ event_date: '2030-01-01' }));
      expect(data).toEqual([]);
      expect(pagination.total).toBe(0);
    });

    it('supports an inclusive date range, ordered by date', async () => {
      const { data } = unwrap(await driver().searchEvents({ date_from: '2026-11-10', date_to: '2026-12-04' }));
      expect(ids(data)).toEqual([8, 9, 10]);
    });

    it('rejects a range whose start is after its end', async () => {
      expectRejected(await driver().searchEvents({ date_from: '2027-01-01', date_to: '2026-01-01' }), VALIDATION_REJECTION);
    });

    it.each(['2026-02-30', '04-12-2026', 'tomorrow'])('rejects the invalid date %p', async (event_date) => {
      expectRejected(await driver().searchEvents({ event_date }), VALIDATION_REJECTION);
    });
  });

  describe('2. Searching events by client', () => {
    it('finds all events for a client', async () => {
      const { data } = unwrap(await driver().searchEvents({ client: 'Tuwaiq Capital' }));
      expect(ids(data)).toEqual([3, 12]);
      expect(data.every((event) => event.client === 'Tuwaiq Capital')).toBe(true);
    });

    it('matches partially and ignores case', async () => {
      const { data } = unwrap(await driver().searchEvents({ client: 'tuwaiq' }));
      expect(ids(data)).toEqual([3, 12]);
    });

    it('returns nothing for an unknown client', async () => {
      expect(unwrap(await driver().searchEvents({ client: 'No Such Client' })).data).toEqual([]);
    });

    it('treats % and _ literally instead of as SQL wildcards', async () => {
      expect(unwrap(await driver().searchEvents({ client: '%' })).data).toEqual([]);
      expect(unwrap(await driver().searchEvents({ client: 'Najd_Telecom' })).data).toEqual([]);
    });
  });

  describe('3. Searching events by status', () => {
    it('returns only events with the requested status', async () => {
      const { data } = unwrap(await driver().searchEvents({ status: 'CANCELLED' }));
      expect(ids(data)).toEqual([4, 7]);
      expect(data.every((event) => event.status === 'CANCELLED')).toBe(true);
    });

    it.each([
      ['PLANNED', 5],
      ['IN_PROGRESS', 2],
      ['COMPLETED', 5],
      ['CANCELLED', 2],
    ])('supports status %s (%i events)', async (status, expected) => {
      const { data, pagination } = unwrap(await driver().searchEvents({ status }));
      expect(pagination.total).toBe(expected);
      expect(data.every((event) => event.status === status)).toBe(true);
    });

    it('rejects an unknown status', async () => {
      expectRejected(await driver().searchEvents({ status: 'DONE' }), VALIDATION_REJECTION);
    });

    it('combines multiple filters with AND', async () => {
      expect(ids(unwrap(await driver().searchEvents({ client: 'Najd', status: 'PLANNED' })).data)).toEqual([10]);
      expect(ids(unwrap(await driver().searchEvents({ client: 'Najd', status: 'COMPLETED' })).data)).toEqual([1]);
      expect(
        ids(unwrap(await driver().searchEvents({ event_date: '2026-12-04', client: 'Najd Telecom', status: 'PLANNED' })).data),
      ).toEqual([10]);
      expect(
        unwrap(await driver().searchEvents({ event_date: '2026-12-04', client: 'Najd Telecom', status: 'COMPLETED' })).data,
      ).toEqual([]);
    });

    it('paginates results', async () => {
      const { data, pagination } = unwrap(await driver().searchEvents({ limit: 5, offset: 10 }));
      expect(data).toHaveLength(4);
      expect(pagination).toEqual({ total: 14, limit: 5, offset: 10 });
    });
  });

  describe('4. Retrieving complete event details', () => {
    it('returns every stored field', async () => {
      expect(unwrap(await driver().getEventDetails(8))).toEqual({
        id: 8,
        event_name: 'Dammam Healthcare Innovation Summit',
        event_date: '2026-11-10',
        client: 'Al Noor Healthcare Group',
        budget: 560000,
        status: 'IN_PROGRESS',
        number_of_projects: 5,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      });
    });

    it('returns the budget as a number', async () => {
      expect(typeof unwrap(await driver().getEventDetails(8)).budget).toBe('number');
    });

    it('reports an unknown event as NOT_FOUND', async () => {
      expectRejected(await driver().getEventDetails(99999), 'NOT_FOUND');
    });
  });

  describe('5. Adding an event', () => {
    it('proposes the event first and saves nothing', async () => {
      const proposal = await proposeCreate(driver());
      expect(proposal.operation).toBe('CREATE_EVENT');
      expect(proposal.proposed).toEqual({ ...NEW_EVENT, status: 'PLANNED' });
      expect(proposal.confirmation_token.length).toBeGreaterThanOrEqual(40);
      expect(await countEvents()).toBe(14);
    });

    it('shows the user what will be created and asks for confirmation', async () => {
      const { summary, instructions } = await proposeCreate(driver());
      for (const detail of ['Saudi Tech Expo', '2027-05-10', 'Kingdom Fintech Council', 'SAR 310,500.5', 'Number of projects: 3', 'PLANNED']) {
        expect(summary).toContain(detail);
      }
      expect(summary).toContain('Would you like me to proceed?');
      expect(instructions).toMatch(/Never assume or infer confirmation/);
    });

    it('creates exactly the proposed event once confirmed', async () => {
      const { confirmation_token } = await proposeCreate(driver());
      const { event } = await confirmCreate(driver(), confirmation_token);

      expect(event).toMatchObject({ ...NEW_EVENT, status: 'PLANNED' });
      expect(await countEvents()).toBe(15);
      const row = await findEventRow(event.id);
      expect(row).toMatchObject({ event_name: 'Saudi Tech Expo', event_date: '2027-05-10', client: 'Kingdom Fintech Council', budget: 310500.5, status: 'PLANNED', number_of_projects: 3 });
    });

    it('makes the new event searchable and retrievable', async () => {
      const { confirmation_token } = await proposeCreate(driver());
      const { event } = await confirmCreate(driver(), confirmation_token);
      expect(ids(unwrap(await driver().searchEvents({ client: 'Kingdom' })).data)).toContain(event.id);
      expect(unwrap(await driver().getEventDetails(event.id)).event_name).toBe('Saudi Tech Expo');
    });

    it('applies defaults for the optional fields', async () => {
      const minimal = { event_name: 'Minimal Event', event_date: '2027-06-01', client: 'Najd Telecom', budget: 1000 };
      const { confirmation_token } = await proposeCreate(driver(), minimal);
      const { event } = await confirmCreate(driver(), confirmation_token, minimal);
      expect(event).toMatchObject({ status: 'PLANNED', number_of_projects: 0 });
    });

    it('accepts an explicit initial status', async () => {
      const input = { ...NEW_EVENT, status: 'IN_PROGRESS' };
      const { confirmation_token } = await proposeCreate(driver(), input);
      expect((await confirmCreate(driver(), confirmation_token, input)).event.status).toBe('IN_PROGRESS');
    });

    it('trims surrounding whitespace from text fields', async () => {
      const input = { ...NEW_EVENT, event_name: '  Padded Name  ', client: ' Najd Telecom ' };
      const { confirmation_token } = await proposeCreate(driver(), input);
      expect((await confirmCreate(driver(), confirmation_token, input)).event).toMatchObject({ event_name: 'Padded Name', client: 'Najd Telecom' });
    });

    it.each([
      ['a missing event_name', { event_name: undefined }],
      ['a blank event_name', { event_name: '   ' }],
      ['a missing event_date', { event_date: undefined }],
      ['an impossible date', { event_date: '2027-02-30' }],
      ['a missing client', { client: undefined }],
      ['a missing budget', { budget: undefined }],
      ['a negative budget', { budget: -1 }],
      ['a budget given as text', { budget: '1000' }],
      ['a budget with 3 decimals', { budget: 10.123 }],
      ['a budget above the column limit', { budget: 10_000_000_000 }],
      ['a negative project count', { number_of_projects: -1 }],
      ['a fractional project count', { number_of_projects: 1.5 }],
      ['an unknown status', { status: 'DONE' }],
    ])('validates input before proposing anything: %s', async (_label, override) => {
      expectRejected(await driver().addEvent({ ...NEW_EVENT, ...override }), VALIDATION_REJECTION);
      expect(await countPendingOperations()).toBe(0);
      expect(await countEvents()).toBe(14);
    });
  });

  describe('6. Updating event status', () => {
    it('proposes the change first and modifies nothing', async () => {
      const proposal = await proposeStatus(driver(), 8, 'COMPLETED');
      expect(proposal.operation).toBe('UPDATE_EVENT_STATUS');
      expect(proposal.proposed).toEqual({ event_id: 8, status: 'COMPLETED' });
      expect(proposal.summary).toContain('IN_PROGRESS -> COMPLETED');
      expect(proposal.summary).toContain('Dammam Healthcare Innovation Summit');
      expect(proposal.summary).toContain('Would you like me to proceed?');
      expect((await findEventRow(8))?.status).toBe('IN_PROGRESS');
    });

    it('applies the change once confirmed', async () => {
      const { confirmation_token } = await proposeStatus(driver(), 8, 'COMPLETED');
      const { event } = await confirmStatus(driver(), 8, 'COMPLETED', confirmation_token);
      expect(event).toMatchObject({ id: 8, status: 'COMPLETED' });
      expect((await findEventRow(8))?.status).toBe('COMPLETED');
      expect(unwrap(await driver().getEventDetails(8)).status).toBe('COMPLETED');
    });

    it('changes only the targeted event', async () => {
      const { confirmation_token } = await proposeStatus(driver(), 8, 'CANCELLED');
      await confirmStatus(driver(), 8, 'CANCELLED', confirmation_token);
      expect((await findEventRow(9))?.status).toBe('IN_PROGRESS');
      expect(await countEvents()).toBe(14);
    });

    it.each(['PLANNED', 'COMPLETED', 'CANCELLED'])('supports moving an in-progress event to %s', async (status) => {
      const { confirmation_token } = await proposeStatus(driver(), 8, status);
      expect((await confirmStatus(driver(), 8, status, confirmation_token)).event.status).toBe(status);
    });

    it('rejects an unknown event before proposing anything', async () => {
      expectRejected(await driver().updateEventStatus(99999, { status: 'COMPLETED' }), 'NOT_FOUND');
      expect(await countPendingOperations()).toBe(0);
    });

    it('rejects an invalid status before proposing anything', async () => {
      expectRejected(await driver().updateEventStatus(8, { status: 'DONE' }), VALIDATION_REJECTION);
      expectRejected(await driver().updateEventStatus(8, {}), VALIDATION_REJECTION);
      expect(await countPendingOperations()).toBe(0);
    });

    it('rejects a change to the status the event already has', async () => {
      expectRejected(await driver().updateEventStatus(8, { status: 'IN_PROGRESS' }), 'CONFLICT');
      expect(await countPendingOperations()).toBe(0);
    });
  });

  describe('7. Drafting English marketing content', () => {
    it('writes an English Instagram post from the event\'s real data', async () => {
      const result = unwrap(await driver().draftMarketingMessage(10, { channel: 'INSTAGRAM_POST', language: 'EN' }));
      expect(result).toMatchObject({ event_id: 10, event_name: 'Riyadh Season Pop-Up Showcase', channel: 'INSTAGRAM_POST' });
      expect(result.drafts).toHaveLength(1);
      const [draft] = result.drafts;
      expect(draft.language).toBe('EN');
      expect(draft.subject).toBeUndefined();
      for (const fact of ['Riyadh Season Pop-Up Showcase', 'Friday, 4 December 2026', 'Najd Telecom', '#RiyadhSeasonPopUpShowcase']) {
        expect(draft.body).toContain(fact);
      }
    });

    it('writes an English marketing email with a subject', async () => {
      const [draft] = unwrap(await driver().draftMarketingMessage(10, { channel: 'EMAIL', language: 'EN' })).drafts;
      expect(draft.subject).toContain('Riyadh Season Pop-Up Showcase');
      for (const fact of ['Riyadh Season Pop-Up Showcase', 'Friday, 4 December 2026', 'Najd Telecom']) {
        expect(draft.body).toContain(fact);
      }
    });

    it('defaults to English when no language is given', async () => {
      const { drafts } = unwrap(await driver().draftMarketingMessage(10, { channel: 'EMAIL' }));
      expect(drafts.map((draft) => draft.language)).toEqual(['EN']);
    });

    it('reads the event from MySQL at request time rather than inventing details', async () => {
      await EventModel.update({ event_name: 'Renamed Via SQL', client: 'Brand New Client' }, { where: { id: 10 } });
      const [draft] = unwrap(await driver().draftMarketingMessage(10, { channel: 'INSTAGRAM_POST', language: 'EN' })).drafts;
      expect(draft.body).toContain('Renamed Via SQL');
      expect(draft.body).toContain('Brand New Client');
      expect(draft.body).toContain('#RenamedViaSQL');
      expect(draft.body).not.toContain('Riyadh Season');
    });

    it('never discloses the budget in public-facing copy', async () => {
      for (const channel of ['INSTAGRAM_POST', 'EMAIL']) {
        const { drafts } = unwrap(await driver().draftMarketingMessage(10, { channel, language: 'BOTH' }));
        for (const { body, subject } of drafts) {
          expect(`${subject ?? ''}${body}`).not.toMatch(/670[,.]?000|SAR/);
        }
      }
    });

    it.each([
      [1, /Thank you/, 'a completed event gets a thank-you'],
      [8, /Preparations are underway/, 'an in-progress event says preparations are underway'],
      [10, /Save the date/, 'a planned event gets an invitation'],
    ])('adapts to event %i: %s', async (eventId, expected) => {
      const [draft] = unwrap(await driver().draftMarketingMessage(eventId, { channel: 'INSTAGRAM_POST', language: 'EN' })).drafts;
      expect(draft.body).toMatch(expected);
    });

    it('refuses to promote a cancelled event', async () => {
      expectRejected(await driver().draftMarketingMessage(4, { channel: 'INSTAGRAM_POST', language: 'EN' }), 'VALIDATION_ERROR');
    });

    it('reports an unknown event as NOT_FOUND', async () => {
      expectRejected(await driver().draftMarketingMessage(99999, { channel: 'EMAIL', language: 'EN' }), 'NOT_FOUND');
    });

    it.each([{ channel: 'TWITTER' }, { channel: 'EMAIL', language: 'FR' }, {}])('rejects invalid options %j', async (input) => {
      expectRejected(await driver().draftMarketingMessage(10, input), VALIDATION_REJECTION);
    });

    it('does not modify the event', async () => {
      const before = await findEventRow(10);
      unwrap(await driver().draftMarketingMessage(10, { channel: 'EMAIL', language: 'BOTH' }));
      const after = await findEventRow(10);
      expect(after?.toJSON()).toEqual(before?.toJSON());
    });
  });

  describe('8. Drafting Arabic marketing content', () => {
    const ARABIC = /\p{Script=Arabic}/u;
    const HIJRI_MONTHS = /محرم|ربيع|جمادى|رجب|شعبان|رمضان|شوال|ذو القعدة|ذو الحجة/;

    it('writes an Arabic Instagram post using the Gregorian date', async () => {
      const result = unwrap(await driver().draftMarketingMessage(10, { channel: 'INSTAGRAM_POST', language: 'AR' }));
      expect(result.drafts).toHaveLength(1);
      const [draft] = result.drafts;
      expect(draft.language).toBe('AR');
      expect(draft.body).toMatch(ARABIC);
      expect(draft.body).toContain('ديسمبر');
      expect(draft.body).not.toMatch(HIJRI_MONTHS);
      expect(draft.body).toContain('Riyadh Season Pop-Up Showcase');
      expect(draft.body).toContain('Najd Telecom');
    });

    it('writes an Arabic marketing email with an Arabic subject', async () => {
      const [draft] = unwrap(await driver().draftMarketingMessage(10, { channel: 'EMAIL', language: 'AR' })).drafts;
      expect(draft.subject).toMatch(ARABIC);
      expect(draft.subject).toContain('Riyadh Season Pop-Up Showcase');
      expect(draft.body).toMatch(ARABIC);
      expect(draft.body).toContain('Najd Telecom');
    });

    it('returns both languages, English first, when asked for BOTH', async () => {
      const { drafts } = unwrap(await driver().draftMarketingMessage(10, { channel: 'INSTAGRAM_POST', language: 'BOTH' }));
      expect(drafts.map((draft) => draft.language)).toEqual(['EN', 'AR']);
      expect(drafts[0].body).not.toMatch(ARABIC);
      expect(drafts[1].body).toMatch(ARABIC);
      expect(drafts.every((draft) => draft.channel === 'INSTAGRAM_POST')).toBe(true);
    });

    it('uses a thank-you tone for a completed event', async () => {
      const [draft] = unwrap(await driver().draftMarketingMessage(1, { channel: 'EMAIL', language: 'AR' })).drafts;
      expect(draft.subject).toContain('شكراً');
    });

    it('refuses to promote a cancelled event', async () => {
      expectRejected(await driver().draftMarketingMessage(4, { channel: 'EMAIL', language: 'AR' }), 'VALIDATION_ERROR');
    });
  });

  describe('9. Rejecting event creation without confirmation', () => {
    it('never creates an event when no confirmation token is supplied', async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const value = unwrap(await driver().addEvent(NEW_EVENT));
        expect(value.outcome).toBe('CONFIRMATION_REQUIRED');
      }
      expect(await countEventsNamed('Saudi Tech Expo')).toBe(0);
      expect(await countEvents()).toBe(14);
    });

    it.each([
      ['a made-up token', 'not-a-real-token'],
      ['a well-formed but never-issued token', 'A'.repeat(43)],
    ])('rejects %s and writes nothing', async (_label, token) => {
      expectRejected(await driver().addEvent({ ...NEW_EVENT, confirmation_token: token }), 'CONFIRMATION_TOKEN_INVALID');
      expect(await countEventsNamed('Saudi Tech Expo')).toBe(0);
    });

    it.each(['', '   '])('rejects an empty confirmation token %p and writes nothing', async (token) => {
      expectRejected(await driver().addEvent({ ...NEW_EVENT, confirmation_token: token }), VALIDATION_REJECTION);
      expect(await countEventsNamed('Saudi Tech Expo')).toBe(0);
    });

    it('rejects a token that was issued for a status change', async () => {
      const { confirmation_token } = await proposeStatus(driver(), 8, 'COMPLETED');
      expectRejected(await driver().addEvent({ ...NEW_EVENT, confirmation_token }), 'CONFIRMATION_PARAMETERS_MISMATCH');
      expect(await countEvents()).toBe(14);
    });
  });

  describe('10. Rejecting a status update without confirmation', () => {
    it('never changes the status when no confirmation token is supplied', async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        expect(unwrap(await driver().updateEventStatus(8, { status: 'COMPLETED' })).outcome).toBe('CONFIRMATION_REQUIRED');
      }
      expect((await findEventRow(8))?.status).toBe('IN_PROGRESS');
    });

    it.each([
      ['a made-up token', 'not-a-real-token'],
      ['a well-formed but never-issued token', 'B'.repeat(43)],
    ])('rejects %s and changes nothing', async (_label, token) => {
      expectRejected(await driver().updateEventStatus(8, { status: 'COMPLETED', confirmation_token: token }), 'CONFIRMATION_TOKEN_INVALID');
      expect((await findEventRow(8))?.status).toBe('IN_PROGRESS');
    });

    it.each(['', '   '])('rejects an empty confirmation token %p and changes nothing', async (token) => {
      expectRejected(await driver().updateEventStatus(8, { status: 'COMPLETED', confirmation_token: token }), VALIDATION_REJECTION);
      expect((await findEventRow(8))?.status).toBe('IN_PROGRESS');
    });

    it('rejects a token that was issued for creating an event', async () => {
      const { confirmation_token } = await proposeCreate(driver());
      expectRejected(await driver().updateEventStatus(8, { status: 'COMPLETED', confirmation_token }), 'CONFIRMATION_PARAMETERS_MISMATCH');
      expect((await findEventRow(8))?.status).toBe('IN_PROGRESS');
    });
  });

  describe('11. Rejecting expired confirmation tokens', () => {
    it('reports the expiry time as now + the configured TTL', async () => {
      const { expires_at } = await proposeCreate(driver());
      expect(expires_at).toBe(new Date(harness.clock.now().getTime() + CONFIRMATION_TTL_SECONDS * 1000).toISOString());
    });

    it('rejects an expired event creation and writes nothing', async () => {
      const { confirmation_token } = await proposeCreate(driver());
      harness.clock.advanceSeconds(CONFIRMATION_TTL_SECONDS + 1);
      expectRejected(await driver().addEvent({ ...NEW_EVENT, confirmation_token }), 'CONFIRMATION_TOKEN_EXPIRED');
      expect(await countEventsNamed('Saudi Tech Expo')).toBe(0);
      expect(await countConsumedOperations()).toBe(0);
    });

    it('rejects an expired status update and changes nothing', async () => {
      const { confirmation_token } = await proposeStatus(driver(), 8, 'COMPLETED');
      harness.clock.advanceSeconds(CONFIRMATION_TTL_SECONDS + 1);
      expectRejected(await driver().updateEventStatus(8, { status: 'COMPLETED', confirmation_token }), 'CONFIRMATION_TOKEN_EXPIRED');
      expect((await findEventRow(8))?.status).toBe('IN_PROGRESS');
      expect(await countConsumedOperations()).toBe(0);
    });

    it('treats the exact expiry instant as expired', async () => {
      const { confirmation_token } = await proposeCreate(driver());
      harness.clock.advanceSeconds(CONFIRMATION_TTL_SECONDS);
      expectRejected(await driver().addEvent({ ...NEW_EVENT, confirmation_token }), 'CONFIRMATION_TOKEN_EXPIRED');
    });

    it('still accepts a token one second before it expires', async () => {
      const { confirmation_token } = await proposeCreate(driver());
      harness.clock.advanceSeconds(CONFIRMATION_TTL_SECONDS - 1);
      expect((await confirmCreate(driver(), confirmation_token)).event.event_name).toBe('Saudi Tech Expo');
    });

    it('lets the user start over with a fresh proposal after expiry', async () => {
      const stale = await proposeCreate(driver());
      harness.clock.advanceSeconds(CONFIRMATION_TTL_SECONDS + 60);
      expectRejected(await driver().addEvent({ ...NEW_EVENT, confirmation_token: stale.confirmation_token }), 'CONFIRMATION_TOKEN_EXPIRED');

      const fresh = await proposeCreate(driver());
      expect(fresh.confirmation_token).not.toBe(stale.confirmation_token);
      await confirmCreate(driver(), fresh.confirmation_token);
      expect(await countEventsNamed('Saudi Tech Expo')).toBe(1);
    });
  });

  describe('12. Preventing duplicate confirmation', () => {
    it('creates the event only once however often the token is replayed', async () => {
      const { confirmation_token } = await proposeCreate(driver());
      await confirmCreate(driver(), confirmation_token);
      for (let replay = 0; replay < 3; replay++) {
        expectRejected(await driver().addEvent({ ...NEW_EVENT, confirmation_token }), 'CONFIRMATION_TOKEN_ALREADY_USED');
      }
      expect(await countEventsNamed('Saudi Tech Expo')).toBe(1);
      expect(await countEvents()).toBe(15);
    });

    it('applies a status change only once', async () => {
      const { confirmation_token } = await proposeStatus(driver(), 8, 'COMPLETED');
      await confirmStatus(driver(), 8, 'COMPLETED', confirmation_token);

      await EventModel.update({ status: 'IN_PROGRESS' }, { where: { id: 8 } }); // someone reverts it
      expectRejected(await driver().updateEventStatus(8, { status: 'COMPLETED', confirmation_token }), 'CONFIRMATION_TOKEN_ALREADY_USED');
      expect((await findEventRow(8))?.status).toBe('IN_PROGRESS');
    });

    it('still reports a used token as used after it would have expired', async () => {
      const { confirmation_token } = await proposeCreate(driver());
      await confirmCreate(driver(), confirmation_token);
      harness.clock.advanceSeconds(CONFIRMATION_TTL_SECONDS + 1);
      expectRejected(await driver().addEvent({ ...NEW_EVENT, confirmation_token }), 'CONFIRMATION_TOKEN_ALREADY_USED');
    });

    it('treats separate proposals as independent confirmations', async () => {
      const first = await proposeCreate(driver());
      const second = await proposeCreate(driver());
      expect(second.confirmation_token).not.toBe(first.confirmation_token);
      await confirmCreate(driver(), first.confirmation_token);
      await confirmCreate(driver(), second.confirmation_token);
      expect(await countEventsNamed('Saudi Tech Expo')).toBe(2);
    });
  });
});
