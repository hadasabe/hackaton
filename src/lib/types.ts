export type CategoryKind = 'expense' | 'income';

export interface Account {
  id?: number;
  name: string;
  bank: string;
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
}

export interface Rule {
  id?: number;
  pattern: string;
  categoryId: string;
  kind: 'expense' | 'income' | 'any';
  createdAt: number;
}

export interface Transaction {
  id?: number;
  accountId: number;
  date: string; // yyyy-MM-dd
  amount: number; // kopecks, signed: expense < 0, income > 0
  payee: string;
  purpose: string;
  categoryId: string;
  hash: string;
  batchId: number;
  createdAt: number;
}

export interface ImportBatch {
  id?: number;
  fileName: string;
  accountId: number;
  importedAt: number;
  added: number;
  duplicates: number;
  skipped: number;
}
