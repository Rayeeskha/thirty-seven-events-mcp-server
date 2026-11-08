import { randomBytes, randomUUID } from 'node:crypto';
import { Transaction } from 'sequelize';
import { ConfirmationError } from '../../utils/errors';
import { canonicalHash, sha256Hex } from '../../utils/hash';
import { PendingOperationRepository } from './confirmation.repository';
import { OperationType } from './confirmation.types';

export type Clock = () => Date;

export interface IssueRequest {
  operation: OperationType;
  /** The exact parameters the confirmation is bound to; any change invalidates the token. */
  boundParams: object;
  /** Extra state captured at proposal time, handed back when the operation is consumed. */
  snapshot: object;
}

export interface IssuedConfirmation {
  token: string;
  expiresAt: Date;
}

export interface ConsumeRequest {
  token: string;
  operation: OperationType;
  boundParams: object;
}

export class ConfirmationService {
  constructor(
    private readonly repository: PendingOperationRepository,
    private readonly ttlSeconds: number,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async issue(request: IssueRequest): Promise<IssuedConfirmation> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.clock().getTime() + this.ttlSeconds * 1000);

    await this.repository.create({
      id: randomUUID(),
      tokenHash: sha256Hex(token),
      operationType: request.operation,
      payload: request.snapshot,
      payloadHash: canonicalHash(request.boundParams),
      expiresAt,
    });
    return { token, expiresAt };
  }

  /**
   * Validates the token against the exact operation and parameters, then consumes it.
   * Must run inside the same transaction as the write it authorises: if the write fails,
   * the consumption is rolled back with it. Every query here must use that transaction; a query on
   * another connection would let concurrent confirmations exhaust the pool and deadlock.
   * Returns the snapshot stored at proposal time.
   */
  async consume(request: ConsumeRequest, transaction: Transaction): Promise<object> {
    const now = this.clock();
    const pending = await this.repository.findByTokenHash(sha256Hex(request.token), transaction);

    if (!pending) {
      throw new ConfirmationError('INVALID', 'Confirmation token is not recognised');
    }
    if (pending.consumed_at) {
      throw new ConfirmationError('ALREADY_USED', 'Confirmation token has already been used');
    }
    if (pending.expires_at <= now) {
      throw new ConfirmationError('EXPIRED', 'Confirmation token has expired; request a new confirmation');
    }
    if (
      pending.operation_type !== request.operation ||
      pending.payload_hash !== canonicalHash(request.boundParams)
    ) {
      throw new ConfirmationError(
        'PARAMETERS_MISMATCH',
        'The parameters differ from those that were proposed for this confirmation token',
      );
    }

    const claimed = await this.repository.claim(pending.id, now, transaction);
    if (!claimed) {
      // Lost a race with a concurrent confirmation (or the token expired in between).
      throw new ConfirmationError('ALREADY_USED', 'Confirmation token has already been used');
    }
    return pending.payload;
  }
}
