import { sequelize } from '../../src/config/database';
import { EventModel } from '../../src/database/models/event.model';
import { PendingOperationModel } from '../../src/database/models/pending-operation.model';
import seeder from '../../src/database/seeders/20260101000001-sample-events';

/** Restores the exact seed data (ids 1-14) and clears pending confirmations. */
export async function resetDatabase(): Promise<void> {
  await sequelize.query('TRUNCATE TABLE pending_operations');
  await sequelize.query('TRUNCATE TABLE events');
  await seeder.up(sequelize.getQueryInterface());
}

export const countEvents = (): Promise<number> => EventModel.count();

export const countEventsNamed = (eventName: string): Promise<number> =>
  EventModel.count({ where: { event_name: eventName } });

export const findEventRow = (id: number): Promise<EventModel | null> => EventModel.findByPk(id);

export const countPendingOperations = (): Promise<number> => PendingOperationModel.count();

export const countConsumedOperations = async (): Promise<number> =>
  (await PendingOperationModel.findAll()).filter((operation) => operation.consumed_at !== null).length;
