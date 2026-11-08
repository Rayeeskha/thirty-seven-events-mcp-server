import { Op, Transaction, WhereOptions } from 'sequelize';
import { EventModel } from '../../database/models/event.model';
import { CreateEventInput, SearchEventsInput } from './event.validation';
import { EventStatus } from './event.types';

export interface WriteOptions {
  transaction?: Transaction;
}

export interface SearchResult {
  rows: EventModel[];
  total: number;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export class EventRepository {
  async search(criteria: SearchEventsInput): Promise<SearchResult> {
    const { event_date, date_from, date_to, client, status, limit, offset } = criteria;
    const where: WhereOptions<EventModel> = {};
    const conditions: WhereOptions<EventModel>[] = [];

    if (event_date) conditions.push({ event_date });
    if (date_from) conditions.push({ event_date: { [Op.gte]: date_from } });
    if (date_to) conditions.push({ event_date: { [Op.lte]: date_to } });
    if (client) conditions.push({ client: { [Op.like]: `%${escapeLikePattern(client)}%` } });
    if (status) conditions.push({ status });
    if (conditions.length > 0) Object.assign(where, { [Op.and]: conditions });

    const { rows, count } = await EventModel.findAndCountAll({
      where,
      order: [
        ['event_date', 'ASC'],
        ['id', 'ASC'],
      ],
      limit,
      offset,
    });
    return { rows, total: count };
  }

  findById(id: number, options: WriteOptions & { lock?: boolean } = {}): Promise<EventModel | null> {
    return EventModel.findByPk(id, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined,
    });
  }

  create(input: CreateEventInput, options: WriteOptions = {}): Promise<EventModel> {
    return EventModel.create(input, { transaction: options.transaction });
  }

  async updateStatus(event: EventModel, status: EventStatus, options: WriteOptions = {}): Promise<EventModel> {
    return event.update({ status }, { transaction: options.transaction });
  }
}
