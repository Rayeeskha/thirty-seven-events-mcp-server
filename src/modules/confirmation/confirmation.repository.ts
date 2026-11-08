import { Op, Transaction } from 'sequelize';
import { PendingOperationModel } from '../../database/models/pending-operation.model';
import { OperationType } from './confirmation.types';

export interface NewPendingOperation {
  id: string;
  tokenHash: string;
  operationType: OperationType;
  payload: object;
  payloadHash: string;
  expiresAt: Date;
}

export class PendingOperationRepository {
  create(data: NewPendingOperation): Promise<PendingOperationModel> {
    return PendingOperationModel.create({
      id: data.id,
      token_hash: data.tokenHash,
      operation_type: data.operationType,
      payload: data.payload,
      payload_hash: data.payloadHash,
      expires_at: data.expiresAt,
    });
  }

  /** Pass the caller's transaction so the lookup reuses its connection instead of acquiring a second one. */
  findByTokenHash(tokenHash: string, transaction?: Transaction): Promise<PendingOperationModel | null> {
    return PendingOperationModel.findOne({ where: { token_hash: tokenHash }, transaction });
  }

  /**
   * Atomically marks the operation as consumed. Returns false if it was already consumed
   * or has expired, so exactly one of several concurrent confirmations can succeed.
   */
  async claim(id: string, now: Date, transaction: Transaction): Promise<boolean> {
    const [affectedRows] = await PendingOperationModel.update(
      { consumed_at: now },
      {
        where: { id, consumed_at: null, expires_at: { [Op.gt]: now } },
        transaction,
      },
    );
    return affectedRows === 1;
  }
}
