import Dexie, { type EntityTable } from 'dexie';
import type { Account, Category, ImportBatch, Rule, Transaction } from './types';

export class SmetaDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  rules!: EntityTable<Rule, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  batches!: EntityTable<ImportBatch, 'id'>;

  constructor() {
    super('smeta');
    this.version(1).stores({
      accounts: '++id, name, createdAt',
      categories: 'id, name, kind',
      rules: '++id, pattern, categoryId, kind, createdAt',
      transactions: '++id, date, amount, categoryId, accountId, hash, batchId, createdAt',
      batches: '++id, importedAt, accountId',
    });
  }
}

export const db = new SmetaDB();
