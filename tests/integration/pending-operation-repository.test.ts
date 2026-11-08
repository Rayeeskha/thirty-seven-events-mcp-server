/** The atomic claim is the last line of defence against double confirmation, so it is tested directly. */
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { Transaction } from 'sequelize';
import { connectDatabase, sequelize } from '../../src/config/database';
import { PendingOperationModel } from '../../src/database/models/pending-operation.model';
import { PendingOperationRepository } from '../../src/modules/confirmation/confirmation.repository';
import { sha256Hex } from '../../src/utils/hash';
import { resetDatabase } from '../helpers/database';

const T0 = new Date('2026-11-08T12:00:00.000Z');
const at = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);

describe('PendingOperationRepository', () => {
  const repository = new PendingOperationRepository();
  const inTransaction = <T>(work: (transaction: Transaction) => Promise<T>): Promise<T> => sequelize.transaction(work);

  async function createOperation(): Promise<string> {
    const id = randomUUID();
    await repository.create({
      id,
      tokenHash: sha256Hex(id),
      operationType: 'CREATE_EVENT',
      payload: { any: 'thing' },
      payloadHash: sha256Hex('payload'),
      expiresAt: at(300),
    });
    return id;
  }

  beforeAll(connectDatabase);
  beforeEach(resetDatabase);

  describe('claim', () => {
    it('succeeds the first time and records when the operation was consumed', async () => {
      const id = await createOperation();
      expect(await inTransaction((transaction) => repository.claim(id, at(10), transaction))).toBe(true);
      expect((await PendingOperationModel.findByPk(id))?.consumed_at).toEqual(at(10));
    });

    it('fails for an operation that was already claimed, even at a later time', async () => {
      const id = await createOperation();
      await inTransaction((transaction) => repository.claim(id, at(10), transaction));
      expect(await inTransaction((transaction) => repository.claim(id, at(11), transaction))).toBe(false);
      expect((await PendingOperationModel.findByPk(id))?.consumed_at).toEqual(at(10)); // first claim stands
    });

    it('fails once the operation has expired, and leaves it unconsumed', async () => {
      const id = await createOperation();
      expect(await inTransaction((transaction) => repository.claim(id, at(300), transaction))).toBe(false);
      expect(await inTransaction((transaction) => repository.claim(id, at(301), transaction))).toBe(false);
      expect((await PendingOperationModel.findByPk(id))?.consumed_at).toBeNull();
    });

    it('succeeds one second before expiry', async () => {
      const id = await createOperation();
      expect(await inTransaction((transaction) => repository.claim(id, at(299), transaction))).toBe(true);
    });

    it('fails for an unknown operation', async () => {
      expect(await inTransaction((transaction) => repository.claim(randomUUID(), at(10), transaction))).toBe(false);
    });

    it('lets exactly one of many simultaneous claims win, even when each uses a different timestamp', async () => {
      const id = await createOperation();
      const results = await Promise.all(Array.from({ length: 4 }, (_, index) => inTransaction((transaction) => repository.claim(id, at(10 + index), transaction))));
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('is undone when its transaction rolls back', async () => {
      const id = await createOperation();
      await expect(
        inTransaction(async (transaction) => {
          expect(await repository.claim(id, at(10), transaction)).toBe(true);
          throw new Error('the write that the claim authorised failed');
        }),
      ).rejects.toThrow('the write that the claim authorised failed');
      expect((await PendingOperationModel.findByPk(id))?.consumed_at).toBeNull();
      expect(await inTransaction((transaction) => repository.claim(id, at(11), transaction))).toBe(true);
    });
  });

  describe('findByTokenHash', () => {
    it('finds an operation by the hash of its token', async () => {
      const id = await createOperation();
      expect((await repository.findByTokenHash(sha256Hex(id)))?.id).toBe(id);
    });

    it('returns null for an unknown hash', async () => {
      expect(await repository.findByTokenHash(sha256Hex('unknown'))).toBeNull();
    });

    it('can run inside a caller\'s transaction', async () => {
      const id = await createOperation();
      const found = await inTransaction((transaction) => repository.findByTokenHash(sha256Hex(id), transaction));
      expect(found?.id).toBe(id);
    });
  });

  it('enforces unique token hashes at the database level', async () => {
    const id = await createOperation();
    await expect(
      repository.create({ id: randomUUID(), tokenHash: sha256Hex(id), operationType: 'CREATE_EVENT', payload: {}, payloadHash: sha256Hex('x'), expiresAt: at(300) }),
    ).rejects.toThrow();
  });
});
