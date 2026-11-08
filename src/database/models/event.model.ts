import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../../config/database';
import { EVENT_STATUSES, EventStatus } from '../../modules/events/event.types';

export class EventModel extends Model<InferAttributes<EventModel>, InferCreationAttributes<EventModel>> {
  declare id: CreationOptional<number>;
  declare event_name: string;
  declare event_date: string;
  declare client: string;
  declare budget: number;
  declare status: CreationOptional<EventStatus>;
  declare number_of_projects: CreationOptional<number>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

EventModel.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    event_name: { type: DataTypes.STRING(255), allowNull: false },
    event_date: { type: DataTypes.DATEONLY, allowNull: false },
    client: { type: DataTypes.STRING(150), allowNull: false },
    budget: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      // mysql2 returns DECIMAL as a string; expose it as a number.
      get(this: EventModel): number {
        return Number(this.getDataValue('budget'));
      },
    },
    status: {
      type: DataTypes.ENUM(...EVENT_STATUSES),
      allowNull: false,
      defaultValue: 'PLANNED',
    },
    number_of_projects: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);
