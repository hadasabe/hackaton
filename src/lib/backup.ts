import Papa from 'papaparse';
import { db } from './db';
import type { Account, Category, Rule, Transaction } from './types';

export interface Backup {
  app: 'smeta';
  version: 1;
  exportedAt: string;
  accounts: Account[];
  categories: Category[];
  rules: Rule[];
  transactions: Transaction[];
}

function download(content: string, fileName: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportBackup(): Promise<void> {
  const [accounts, categories, rules, transactions] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
    db.rules.toArray(),
    db.transactions.toArray(),
  ]);
  const backup: Backup = {
    app: 'smeta',
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts,
    categories,
    rules,
    transactions,
  };
  const stamp = new Date().toISOString().slice(0, 10);
  download(JSON.stringify(backup, null, 2), `smeta-backup-${stamp}.json`, 'application/json');
}

export function exportTransactionsCsv(
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
): void {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const rows = transactions
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((transaction) => ({
      Дата: transaction.date,
      Сумма: (transaction.amount / 100).toFixed(2).replace('.', ','),
      Получатель: transaction.payee,
      Назначение: transaction.purpose,
      Категория: categoryNames.get(transaction.categoryId) ?? '',
      Счёт: accountNames.get(transaction.accountId) ?? '',
    }));

  const csv = Papa.unparse(rows, { delimiter: ';' });
  download(`\uFEFF${csv}`, `smeta-operations-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
}

export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.transactions, db.batches, db.rules, db.categories, db.accounts],
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.batches.clear(),
        db.rules.clear(),
        db.categories.clear(),
        db.accounts.clear(),
      ]);
    },
  );
}

export async function importBackupFile(file: File): Promise<{ added: number }> {
  const text = await file.text();
  const parsed = JSON.parse(text) as Partial<Backup>;
  if (parsed.app !== 'smeta' || !Array.isArray(parsed.transactions)) {
    throw new Error('Это не файл резервной копии Сметы.');
  }
  if (Array.isArray(parsed.accounts)) await db.accounts.bulkPut(parsed.accounts);
  if (Array.isArray(parsed.categories)) await db.categories.bulkPut(parsed.categories);
  if (Array.isArray(parsed.rules)) await db.rules.bulkPut(parsed.rules);

  const transactions = parsed.transactions as Transaction[];
  const hashes = transactions.map((transaction) => transaction.hash);
  const existing = new Set<string>();
  for (let i = 0; i < hashes.length; i += 300) {
    const found = await db.transactions
      .where('hash')
      .anyOf(hashes.slice(i, i + 300))
      .toArray();
    found.forEach((transaction) => existing.add(transaction.hash));
  }
  const unique = transactions.filter((transaction) => !existing.has(transaction.hash));
  if (unique.length === 0) return { added: 0 };

  const restoredBatchId = (await db.batches.add({
    fileName: 'Резервная копия',
    accountId: parsed.accounts?.[0]?.id ?? unique[0].accountId,
    importedAt: Date.now(),
    added: 0,
    duplicates: transactions.length - unique.length,
    skipped: 0,
  }))!;

  const restored = unique.map(({ id: _id, ...transaction }) => ({
    ...transaction,
    batchId: restoredBatchId,
  }));

  await db.transactions.bulkAdd(restored as Transaction[]);
  await db.batches.update(restoredBatchId, { added: restored.length });
  return { added: restored.length };
}
