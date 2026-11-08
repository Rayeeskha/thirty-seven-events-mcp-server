/**
 * Concurrency guarantees of the confirmation workflow.
 *
 * Every scenario fires more simultaneous requests than the database pool has connections (5), so a
 * transaction that needed a second connection would starve the pool. That bug existed once; the
 * time bound below turns a regression into a failure instead of a 60-second hang.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { countConsumedOperations, countEvents, countEventsNamed, findEventRow, resetDatabase } from '../helpers/database';
import { McpDriver, Result } from '../helpers/drivers';
import { NEW_EVENT, proposeCreate, proposeStatus } from '../helpers/flows';
import { Harness, startHarness } from '../helpers/harness';

const MAX_SECONDS = 5;

type Tally = Record<string, number>;

function tally(results: Result<{ outcome: string }>[]): Tally {
  const counts: Tally = {};
  for (const result of results) {
    const key = result.ok ? result.value.outcome : result.code;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function timed<T>(work: () => Promise<T>): Promise<{ value: T; seconds: number }> {
  const start = performance.now();
  const value = await work();
  return { value, seconds: (performance.now() - start) / 1000 };
}

describe('concurrent confirmations', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });
  afterAll(async () => {
    await harness.close();
  });
  beforeEach(async () => {
    harness.clock.reset();
    harness.clock.autoAdvance(1); // distinct timestamps per request, as with a real clock
    await resetDatabase();
  });

  describe('one MCP client', () => {
    const driver = (): McpDriver => harness.mcp;

    it('lets exactly one of 30 simultaneous confirmations of the same token succeed', async () => {
      const { confirmation_token } = await proposeCreate(driver());

      const { value: results, seconds } = await timed(() =>
        Promise.all(Array.from({ length: 30 }, () => driver().addEvent({ ...NEW_EVENT, confirmation_token }))),
      );

      expect(tally(results)).toEqual({ EXECUTED: 1, CONFIRMATION_TOKEN_ALREADY_USED: 29 });
      expect(await countEventsNamed('Saudi Tech Expo')).toBe(1);
      expect(await countConsumedOperations()).toBe(1);
      expect(seconds).toBeLessThan(MAX_SECONDS);
    });

    it('confirms 30 different proposals at once without exhausting the connection pool', async () => {
      const inputs = Array.from({ length: 30 }, (_, index) => ({ ...NEW_EVENT, event_name: `Parallel Event ${index}`, budget: 100 + index }));
      const proposals = await Promise.all(inputs.map((input) => proposeCreate(driver(), input)));

      const { value: results, seconds } = await timed(() =>
        Promise.all(inputs.map((input, index) => driver().addEvent({ ...input, confirmation_token: proposals[index].confirmation_token }))),
      );

      expect(tally(results)).toEqual({ EXECUTED: 30 });
      expect(await countEvents()).toBe(44);
      expect(seconds).toBeLessThan(MAX_SECONDS);
    });

    it('applies 12 simultaneous status changes to different events', async () => {
      const eventIds = [1, 2, 3, 5, 6, 8, 9, 10, 11, 12, 13, 14];
      const proposals = await Promise.all(eventIds.map((id) => proposeStatus(driver(), id, 'CANCELLED')));

      const { value: results, seconds } = await timed(() =>
        Promise.all(eventIds.map((id, index) => driver().updateEventStatus(id, { status: 'CANCELLED', confirmation_token: proposals[index].confirmation_token }))),
      );

      expect(tally(results)).toEqual({ EXECUTED: 12 });
      for (const id of eventIds) expect((await findEventRow(id))?.status).toBe('CANCELLED');
      expect(seconds).toBeLessThan(MAX_SECONDS);
    });

    it('lets only one of two competing status changes win; the loser is told the event changed', async () => {
      const toCompleted = await proposeStatus(driver(), 8, 'COMPLETED');
      const toCancelled = await proposeStatus(driver(), 8, 'CANCELLED');

      const results = await Promise.all([
        driver().updateEventStatus(8, { status: 'COMPLETED', confirmation_token: toCompleted.confirmation_token }),
        driver().updateEventStatus(8, { status: 'CANCELLED', confirmation_token: toCancelled.confirmation_token }),
      ]);

      expect(tally(results)).toEqual({ EXECUTED: 1, CONFLICT: 1 });
      const winner = results.find((result) => result.ok && result.value.outcome === 'EXECUTED');
      expect(winner?.ok && winner.value.outcome === 'EXECUTED' && winner.value.event.status).toBe((await findEventRow(8))?.status);
      expect(await countConsumedOperations()).toBe(1); // the loser's token was rolled back, not burned
    });

    it('stays responsive to ordinary requests while confirmations are in flight', async () => {
      const { confirmation_token } = await proposeCreate(driver());
      const confirmations = Array.from({ length: 30 }, () => driver().addEvent({ ...NEW_EVENT, confirmation_token }));

      const { value: reads, seconds } = await timed(() =>
        Promise.all(Array.from({ length: 30 }, () => driver().getEventDetails(10))),
      );
      await Promise.all(confirmations);

      expect(reads.every((read) => read.ok)).toBe(true);
      expect(seconds).toBeLessThan(MAX_SECONDS);
    });
  });

  it('lets exactly one succeed when the same token is confirmed from six MCP clients at once', async () => {
    const extraClients = await Promise.all(Array.from({ length: 5 }, () => harness.connectMcp()));
    const { confirmation_token } = await proposeCreate(harness.mcp);
    const confirm = (driver: McpDriver) => driver.addEvent({ ...NEW_EVENT, confirmation_token });

    const { value: results, seconds } = await timed(() =>
      Promise.all([
        ...Array.from({ length: 10 }, () => confirm(harness.mcp)),
        ...extraClients.flatMap((client) => [confirm(client), confirm(client)]),
      ]),
    );

    expect(tally(results)).toEqual({ EXECUTED: 1, CONFIRMATION_TOKEN_ALREADY_USED: 19 });
    expect(await countEventsNamed('Saudi Tech Expo')).toBe(1);
    expect(seconds).toBeLessThan(MAX_SECONDS);
  });

  it('survives a burst of 60 simultaneous proposals', async () => {
    const { value: results, seconds } = await timed(() =>
      Promise.all(Array.from({ length: 60 }, () => harness.mcp.addEvent(NEW_EVENT))),
    );
    expect(tally(results)).toEqual({ CONFIRMATION_REQUIRED: 60 });
    expect(await countEvents()).toBe(14);
    expect(seconds).toBeLessThan(MAX_SECONDS);
  });
});
