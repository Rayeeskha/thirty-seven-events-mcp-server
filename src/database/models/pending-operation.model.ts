import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../../config/database';
import { OPERATION_TYPES, OperationType } from '../../modules/confirmation/confirmation.types';

export class PendingOperationModel extends Model<
  InferAttributes<PendingOperationModel>,
  InferCreationAttributes<PendingOperationModel>
> {
  declare id: string;
  declare token_hash: string;
  declare operation_type: OperationType;
  declare payload: object;
  declare payload_hash: string;
  declare expires_at: Date;
  declare consumed_at: CreationOptional<Date | null>;
  declare created_at: CreationOptional<Date>;
}

PendingOperationModel.init(
  {
    id: { type: DataTypes.CHAR(36), primaryKey: true },
    token_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
    operation_type: { type: DataTypes.ENUM(...OPERATION_TYPES), allowNull: false },
    payload: {
      type: DataTypes.JSON,
      allowNull: false,
      // Some MySQL-compatible servers (for example MariaDB) keep JSON columns as plain text and hand
      // them back as a string, so accept both forms.
      get(this: PendingOperationModel): object {
        const stored = this.getDataValue('payload') as unknown;
        return (typeof stored === 'string' ? JSON.parse(stored) : stored) as object;
      },
    },
    payload_hash: { type: DataTypes.CHAR(64), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    consumed_at: { type: DataTypes.DATE, allowNull: true },
    created_at: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'pending_operations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  },
);
