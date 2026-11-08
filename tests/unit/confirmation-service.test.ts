import { beforeEach, describe, expect, it } from '@jest/globals';
import { Transaction } from 'sequelize';
import { PendingOperationModel } from '../../src/database/models/pending-operation.model';
import { PendingOperationRepository } from '../../src/modules/confirmation/confirmation.repository';
import { ConfirmationService } from '../../src/modules/confirmation/confirmation.service';
import { ConfirmationFailure } from '../../src/utils/errors';
import { canonicalHash, sha256Hex } from '../../src/utils/hash';
import { FakeClock } from '../helpers/clock';

type Row = Pick<PendingOperationModel, 'id' | 'token_hash' | 'operation_type' | 'payload' | 'payload_hash' | 'expires_at' | 'consumed_at'>;

/** In-memory stand-in that records which transaction every query was given. */
class FakeRepository {
  rows: Row[] = [];
  transactionsSeen: { call: string; transaction: Transaction | undefined }[] = [];
  claimResult = true;
  claims: { id: string; now: Date }[] = [];

  async create(data: { id: string; tokenHash: string; operationType: Row['operation_type']; payload: object; payloadHash: string; expiresAt: Date }) {
    this.rows.push({ id: data.id, token_hash: data.tokenHash, operation_type: data.operationType, payload: data.payload, payload_hash: data.payloadHash, expires_at: data.expiresAt, consumed_at: null });
  }

  async findByTokenHash(tokenHash: string, transaction?: Transaction) {
    this.transactionsSeen.push({ call: 'findByTokenHash', transaction });
    return this.rows.find((row) => row.token_hash === tokenHash) ?? null;
  }

  async claim(id: string, now: Date, transaction: Transaction) {
    this.transactionsSeen.push({ call: 'claim', transaction });
    this.claims.push({ id, now });
    return this.claimResult;
  }
}

const TTL = 300;
const TRANSACTION = { id: 'the-transaction' } as unknown as Transaction;
const PARAMS = { event_name: 'Saudi Tech Expo', budget: 100 };

describe('ConfirmationService', () => {
  let repository: FakeRepository;
  let clock: FakeClock;
  let service: ConfirmationService;

  beforeEach(() => {
    repository = new FakeRepository();
    clock = new FakeClock();
    service = new ConfirmationService(repository as unknown as PendingOperationRepository, TTL, clock.now);
  });

  const issue = (operation: 'CREATE_EVENT' | 'UPDATE_EVENT_STATUS' = 'CREATE_EVENT', boundParams: object = PARAMS) =>
    service.issue({ operation, boundParams, snapshot: { ...boundParams, previous: 'x' } });

  async function failureOf(work: Promise<unknown>): Promise<ConfirmationFailure> {
    try {
      await work;
    } catch (error) {
      return (error as { reason: ConfirmationFailure }).reason;
    }
    throw new Error('Expected the operation to be rejected');
  }

  describe('without an injected clock', () => {
    it('uses the system clock', async () => {
      const real = new ConfirmationService(repository as unknown as PendingOperationRepository, TTL);
      const before = Date.now();
      const { expiresAt } = await real.issue({ operation: 'CREATE_EVENT', boundParams: PARAMS, snapshot: PARAMS });
      const after = Date.now();
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + TTL * 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + TTL * 1000);
    });
  });

  describe('issue', () => {
    it('returns a 43-character base64url token that expires after the TTL', async () => {
      const { token, expiresAt } = await issue();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(expiresAt.toISOString()).toBe('2026-11-08T12:05:00.000Z');
    });

    it('stores the hash of the token and of the bound parameters, never the token', async () => {
      const { token } = await issue();
      const [row] = repository.rows;
      expect(row.token_hash).toBe(sha256Hex(token));
      expect(row.payload_hash).toBe(canonicalHash(PARAMS));
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it('issues a different token every time', async () => {
      const tokens = await Promise.all(Array.from({ length: 50 }, () => issue()));
      expect(new Set(tokens.map((issued) => issued.token)).size).toBe(50);
    });
  });

  describe('consume', () => {
    it('returns the snapshot taken at proposal time and claims the token once', async () => {
      const { token } = await issue();
      const snapshot = await service.consume({ token, operation: 'CREATE_EVENT', boundParams: PARAMS }, TRANSACTION);
      expect(snapshot).toEqual({ ...PARAMS, previous: 'x' });
      expect(repository.claims).toEqual([{ id: repository.rows[0].id, now: clock.now() }]);
    });

    it('accepts parameters listed in a different key order', async () => {
      const { token } = await issue();
      await expect(service.consume({ token, operation: 'CREATE_EVENT', boundParams: { budget: 100, event_name: 'Saudi Tech Expo' } }, TRANSACTION)).resolves.toBeDefined();
    });

    it('uses the caller\'s transaction for every query, so it never needs a second connection', async () => {
      const { token } = await issue();
      await service.consume({ token, operation: 'CREATE_EVENT', boundParams: PARAMS }, TRANSACTION);
      expect(repository.transactionsSeen).toEqual([
        { call: 'findByTokenHash', transaction: TRANSACTION },
        { call: 'claim', transaction: TRANSACTION },
      ]);
    });

    it('looks the token up by its hash, not its plaintext', async () => {
      const lookups: string[] = [];
      const original = repository.findByTokenHash.bind(repository);
      repository.findByTokenHash = async (hash: string, transaction?: Transaction) => (lookups.push(hash), original(hash, transaction));
      const { token } = await issue();
      await service.consume({ token, operation: 'CREATE_EVENT', boundParams: PARAMS }, TRANSACTION);
      expect(lookups).toEqual([sha256Hex(token)]);
    });

    describe('rejections', () => {
      it('INVALID for a token that was never issued', async () => {
        expect(await failureOf(service.consume({ token: 'nope', operation: 'CREATE_EVENT', boundParams: PARAMS }, TRANSACTION))).toBe('INVALID');
        expect(repository.claims).toEqual([]);
      });

      it('EXPIRED once the clock reaches the expiry instant', async () => {
        const { token } = await issue();
        clock.advanceSeconds(TTL);
        expect(await failureOf(service.consume({ token, operation: 'CREATE_EVENT', boundParams: PARAMS }, TRANSACTION))).toBe('EXPIRED');
      });

      it('still valid one second before expiry', async () => {
        const { token } = await issue();
        clock.advanceSeconds(TTL - 1);
        await expect(service.consume({ token, operation: 'CREATE_EVENT', boundParams: PARAMS }, TRANSACTION)).resolves.toBeDefined();
      });

      it('ALREADY_USED for a consumed token', async () => {
        const { token } = await issue();
        repository.rows[0].consumed_at = clock.now();
        expect(await failureOf(service.consume({ token, operation: 'CREATE_EVENT', boundParams: PARAMS }, TRANSACTION))).toBe('ALREADY_USED');
      });

      it('ALREADY_USED when the atomic claim loses a race', async () => {
        const { token } = await issue();
        repository.claimResult = false;
        expect(await failureOf(service.consume({ token, operation: 'CREATE_EVENT', boundParams: PARAMS }, TRANSACTION))).toBe('ALREADY_USED');
      });

      it.each([
        ['a changed value', { event_name: 'Saudi Tech Expo', budget: 101 }],
        ['an extra parameter', { ...PARAMS, extra: true }],
        ['a missing parameter', { event_name: 'Saudi Tech Expo' }],
      ])('PARAMETERS_MISMATCH for %s, without consuming the token', async (_label, boundParams) => {
        const { token } = await issue();
        expect(await failureOf(service.consume({ token, operation: 'CREATE_EVENT', boundParams }, TRANSACTION))).toBe('PARAMETERS_MISMATCH');
        expect(repository.claims).toEqual([]);
      });

      it('PARAMETERS_MISMATCH when the token was issued for a different operation', async () => {
        const { token } = await issue('CREATE_EVENT');
        expect(await failureOf(service.consume({ token, operation: 'UPDATE_EVENT_STATUS', boundParams: PARAMS }, TRANSACTION))).toBe('PARAMETERS_MISMATCH');
      });
    });

    describe('precedence when several things are wrong at once', () => {
      it('reports a used token as ALREADY_USED even if it has also expired and the parameters changed', async () => {
        const { token } = await issue();
        repository.rows[0].consumed_at = clock.now();
        clock.advanceSeconds(TTL + 1);
        expect(await failureOf(service.consume({ token, operation: 'UPDATE_EVENT_STATUS', boundParams: { other: 1 } }, TRANSACTION))).toBe('ALREADY_USED');
      });

      it('reports an expired token as EXPIRED even if the parameters also changed', async () => {
        const { token } = await issue();
        clock.advanceSeconds(TTL + 1);
        expect(await failureOf(service.consume({ token, operation: 'CREATE_EVENT', boundParams: { other: 1 } }, TRANSACTION))).toBe('EXPIRED');
      });
    });
  });
});
