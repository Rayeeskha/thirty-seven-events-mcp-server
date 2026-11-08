/** Properties of the confirmation workflow itself, verified through the MCP tools. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { sequelize } from '../../src/config/database';
import { EventModel } from '../../src/database/models/event.model';
import { PendingOperationModel } from '../../src/database/models/pending-operation.model';
import { sha256Hex } from '../../src/utils/hash';
import { countConsumedOperations, countEvents, countEventsNamed, findEventRow, resetDatabase } from '../helpers/database';
import { McpDriver } from '../helpers/drivers';
import { confirmCreate, confirmStatus, expectRejected, NEW_EVENT, proposeCreate, proposeStatus } from '../helpers/flows';
import { Harness, startHarness } from '../helpers/harness';

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

  describe('a token is bound to the exact parameters that were proposed', () => {
    it.each([
      ['event_name', { event_name: 'Saudi Tech Expo 2' }],
      ['event_date', { event_date: '2027-05-11' }],
      ['client', { client: 'Another Client' }],
      ['budget', { budget: 310500.51 }],
      ['number_of_projects', { number_of_projects: 4 }],
      ['status', { status: 'COMPLETED' }],
    ])('rejects a changed %s and writes nothing', async (_field, change) => {
      const { confirmation_token } = await proposeCreate(driver());
      const result = await driver().addEvent({ ...NEW_EVENT, ...change, confirmation_token });
      expectRejected(result, 'CONFIRMATION_PARAMETERS_MISMATCH');
      expect(await countEvents()).toBe(14);
    });

    it('does not burn the token when parameters are rejected, so the real confirmation still works', async () => {
      const { confirmation_token } = await proposeCreate(driver());
      expectRejected(await driver().addEvent({ ...NEW_EVENT, budget: 1, confirmation_token }), 'CONFIRMATION_PARAMETERS_MISMATCH');
      expect(await countConsumedOperations()).toBe(0);

      const { event } = await confirmCreate(driver(), confirmation_token);
      expect(event.budget).toBe(310500.5);
      expect(await countEventsNamed('Saudi Tech Expo')).toBe(1);
    });

    it('treats omitted optional fields and their explicit defaults as the same parameters', async () => {
      const minimal = { event_name: 'Minimal Event', event_date: '2027-06-01', client: 'Najd Telecom', budget: 1000 };
      const { confirmation_token } = await proposeCreate(driver(), minimal);
      const { event } = await confirmCreate(driver(), confirmation_token, { ...minimal, status: 'PLANNED', number_of_projects: 0 });
      expect(event.event_name).toBe('Minimal Event');
    });

    it('rejects a different status than the one proposed', async () => {
      const { confirmation_token } = await proposeStatus(driver(), 8, 'COMPLETED');
      expectRejected(await driver().updateEventStatus(8, { status: 'CANCELLED', confirmation_token }), 'CONFIRMATION_PARAMETERS_MISMATCH');
      expect((await findEventRow(8))?.status).toBe('IN_PROGRESS');
    });

    it('rejects the token for a different event', async () => {
      const { confirmation_token } = await proposeStatus(driver(), 8, 'COMPLETED');
      expectRejected(await driver().updateEventStatus(9, { status: 'COMPLETED', confirmation_token }), 'CONFIRMATION_PARAMETERS_MISMATCH');
      expect((await findEventRow(9))?.status).toBe('IN_PROGRESS');
      expect((await findEventRow(8))?.status).toBe('IN_PROGRESS');
    });

    it('does not let a token for one event approve a change to another with the same status', async () => {
      const first = await proposeStatus(driver(), 8, 'COMPLETED');
      await proposeStatus(driver(), 9, 'COMPLETED');
      expectRejected(await driver().updateEventStatus(9, { status: 'COMPLETED', confirmation_token: first.confirmation_token }), 'CONFIRMATION_PARAMETERS_MISMATCH');
    });
  });

  describe('a status change is rejected if the event changed since it was proposed', () => {
    it('refuses a stale proposal and leaves the newer status in place', async () => {
      const stale = await proposeStatus(driver(), 8, 'COMPLETED');
      const newer = await proposeStatus(driver(), 8, 'CANCELLED');
      await confirmStatus(driver(), 8, 'CANCELLED', newer.confirmation_token);

      expectRejected(await driver().updateEventStatus(8, { status: 'COMPLETED', confirmation_token: stale.confirmation_token }), 'CONFLICT');
      expect((await findEventRow(8))?.status).toBe('CANCELLED');
    });

    it('does not consume a stale token, and a fresh proposal from the new state works', async () => {
      const stale = await proposeStatus(driver(), 8, 'COMPLETED');
      const newer = await proposeStatus(driver(), 8, 'CANCELLED');
      await confirmStatus(driver(), 8, 'CANCELLED', newer.confirmation_token);
      await driver().updateEventStatus(8, { status: 'COMPLETED', confirmation_token: stale.confirmation_token });

      expect(await countConsumedOperations()).toBe(1); // only the legitimate change

      const fresh = await proposeStatus(driver(), 8, 'COMPLETED');
      expect(fresh.summary).toContain('CANCELLED -> COMPLETED');
      await confirmStatus(driver(), 8, 'COMPLETED', fresh.confirmation_token);
      expect((await findEventRow(8))?.status).toBe('COMPLETED');
    });
  });

  describe('confirmation and write succeed or fail together', () => {
    it('leaves the token unused when the write itself fails', async () => {
      const { confirmation_token } = await proposeStatus(driver(), 8, 'COMPLETED');
      await EventModel.destroy({ where: { id: 8 } }); // the event disappears before confirmation

      expectRejected(await driver().updateEventStatus(8, { status: 'COMPLETED', confirmation_token }), 'NOT_FOUND');
      expect(await countConsumedOperations()).toBe(0);
    });
  });

  describe('when the database returns the stored proposal as text (as MariaDB does)', () => {
    // Re-stores each proposal as a JSON *string*, so the driver hands it back as text, not an object.
    const storeProposalsAsText = () => sequelize.query('UPDATE pending_operations SET payload = JSON_QUOTE(CAST(payload AS CHAR))');

    it('still applies a confirmed status change', async () => {
      const { confirmation_token } = await proposeStatus(driver(), 8, 'COMPLETED');
      await storeProposalsAsText();
      expect((await PendingOperationModel.findOne())?.payload).toEqual(expect.objectContaining({ event_id: 8, previous_status: 'IN_PROGRESS' }));

      const { event } = await confirmStatus(driver(), 8, 'COMPLETED', confirmation_token);
      expect(event.status).toBe('COMPLETED');
      expect((await findEventRow(8))?.status).toBe('COMPLETED');
    });

    it('still detects a stale status proposal', async () => {
      const stale = await proposeStatus(driver(), 8, 'COMPLETED');
      const newer = await proposeStatus(driver(), 8, 'CANCELLED');
      await confirmStatus(driver(), 8, 'CANCELLED', newer.confirmation_token);
      await storeProposalsAsText();

      expectRejected(await driver().updateEventStatus(8, { status: 'COMPLETED', confirmation_token: stale.confirmation_token }), 'CONFLICT');
      expect((await findEventRow(8))?.status).toBe('CANCELLED');
    });

    it('still creates a confirmed event', async () => {
      const { confirmation_token } = await proposeCreate(driver());
      await storeProposalsAsText();
      expect((await confirmCreate(driver(), confirmation_token)).event.event_name).toBe('Saudi Tech Expo');
    });
  });

  describe('token handling', () => {
    it('never stores the token itself, only its SHA-256 hash', async () => {
      const { confirmation_token } = await proposeCreate(driver());
      const [row] = await PendingOperationModel.findAll();
      expect(row.token_hash).toBe(sha256Hex(confirmation_token));
      expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row.toJSON())).not.toContain(confirmation_token);
    });

    it('issues unique, high-entropy tokens', async () => {
      const tokens = new Set<string>();
      for (let index = 0; index < 20; index++) tokens.add((await proposeCreate(driver())).confirmation_token);
      expect(tokens.size).toBe(20);
      for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url
    });

    it('records the operation type and the proposed parameters', async () => {
      await proposeCreate(driver());
      await proposeStatus(driver(), 8, 'COMPLETED');
      const rows = await PendingOperationModel.findAll({ order: [['created_at', 'ASC'], ['id', 'ASC']] });
      expect(rows.map((row) => row.operation_type).sort()).toEqual(['CREATE_EVENT', 'UPDATE_EVENT_STATUS']);
      const statusRow = rows.find((row) => row.operation_type === 'UPDATE_EVENT_STATUS');
      expect(statusRow?.payload).toEqual({ event_id: 8, status: 'COMPLETED', previous_status: 'IN_PROGRESS' });
    });
  });
});
