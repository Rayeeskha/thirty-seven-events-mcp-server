import { Transaction } from 'sequelize';
import { sequelize } from '../config/database';

export type TransactionRunner = <T>(work: (transaction: Transaction) => Promise<T>) => Promise<T>;

export const runInTransaction: TransactionRunner = (work) => sequelize.transaction(work);
