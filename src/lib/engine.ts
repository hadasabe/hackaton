import { addMonths, format, startOfMonth } from 'date-fns';
import { db } from './db';
import { CATEGORIES, DEFAULT_RULES } from './categories';
import type { Account, Category, Rule, Transaction } from './types';
import { makeHash, normalizeHeader, type ParsedTransaction } from './statement';

export function categorize(
  payee: string,
  purpose: string,
  amount: number,
  rules: Rule[],
  categories: Category[],
  categoryName = '',
): string {
  const kind = amount < 0 ? 'expense' : 'income';
  const normalizedName = normalizeHeader(categoryName);
  if (normalizedName) {
    const byName = categories.find(
      (category) => category.kind === kind && normalizeHeader(category.name) === normalizedName,
    );
    if (byName) return byName.id;
  }

  const text = `${payee} ${purpose}`.toLowerCase();
  const matching = rules
    .filter((rule) => rule.kind === 'any' || rule.kind === kind)
    .filter((rule) => text.includes(rule.pattern.toLowerCase()))
    .sort((a, b) => b.pattern.length - a.pattern.length);

  for (const rule of matching) {
    const category = categories.find((item) => item.id === rule.categoryId);
    if (category && category.kind === kind) return category.id;
  }

  return kind === 'expense' ? 'other_expense' : 'other_income';
}

let seedPromise: Promise<void> | null = null;

async function seedDatabase(): Promise<void> {
  const existingCategories = await db.categories.toArray();
  const existingIds = new Set(existingCategories.map((category) => category.id));
  const missing = CATEGORIES.filter((category) => !existingIds.has(category.id));
  if (missing.length > 0) await db.categories.bulkPut(missing);

  if ((await db.rules.count()) === 0) {
    await db.rules.bulkAdd(DEFAULT_RULES);
  }

  if ((await db.accounts.count()) === 0) {
    await db.accounts.add({
      name: 'Основной счёт',
      bank: '',
      createdAt: Date.now(),
    });
  }
}

export function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedDatabase().finally(() => {
      seedPromise = null;
    });
  }
  return seedPromise;
}

export async function createAccount(name: string, bank: string): Promise<number> {
  const id = await db.accounts.add({
    name: name.trim(),
    bank: bank.trim(),
    createdAt: Date.now(),
  });
  return id!;
}

export interface ImportOutcome {
  batchId: number;
  added: number;
  duplicates: number;
  skipped: number;
  total: number;
}

export async function importTransactions(
  rows: ParsedTransaction[],
  accountId: number,
  fileName: string,
  skipped: number,
  rules: Rule[],
  categories: Category[],
): Promise<ImportOutcome> {
  const importedAt = Date.now();
  const batchId = (await db.batches.add({
    fileName,
    accountId,
    importedAt,
    added: 0,
    duplicates: 0,
    skipped,
  }))!;

  const seen = new Set<string>();
  const prepared: Omit<Transaction, 'id'>[] = [];

  for (const row of rows) {
    const hash = makeHash([
      accountId,
      row.date,
      row.amount,
      row.payee,
      row.purpose.slice(0, 80),
    ]);
    if (seen.has(hash)) continue;
    seen.add(hash);
    prepared.push({
      accountId,
      date: row.date,
      amount: row.amount,
      payee: row.payee,
      purpose: row.purpose,
      categoryId: categorize(
        row.payee,
        row.purpose,
        row.amount,
        rules,
        categories,
        row.categoryName,
      ),
      hash,
      batchId,
      createdAt: importedAt,
    });
  }

  const existing = new Set<string>();
  const hashes = [...seen];
  for (let i = 0; i < hashes.length; i += 300) {
    const chunk = hashes.slice(i, i + 300);
    const found = await db.transactions.where('hash').anyOf(chunk).toArray();
    found.forEach((transaction) => existing.add(transaction.hash));
  }

  const unique = prepared.filter((transaction) => !existing.has(transaction.hash));
  if (unique.length > 0) await db.transactions.bulkAdd(unique as Transaction[]);

  const outcome: ImportOutcome = {
    batchId,
    added: unique.length,
    duplicates: prepared.length - unique.length,
    skipped,
    total: rows.length + skipped,
  };

  await db.batches.update(batchId, {
    added: outcome.added,
    duplicates: outcome.duplicates,
    skipped: outcome.skipped,
  });

  return outcome;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dateOf(monthKey: string, day: number): string {
  return `${monthKey}-${pad(day)}`;
}

function monthKeyOffset(offset: number): string {
  return format(addMonths(startOfMonth(new Date()), -offset), 'yyyy-MM');
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function seedDemoData(accountId: number): Promise<number> {
  const batches = await db.batches.toArray();
  if (batches.some((batch) => batch.fileName === 'Демо-данные')) return 0;

  const categories = await db.categories.toArray();
  const categoryIds = new Set(categories.map((category) => category.id));

  const rows: Array<{
    date: string;
    amount: number;
    payee: string;
    purpose: string;
    categoryId: string;
  }> = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const month = monthKeyOffset(offset);
    const salary = offset === 0 ? 85000 : 85000 + randomInt(0, 2) * 5000;
    const maxDay = offset === 0 ? new Date().getDate() : 28;
    const day = (value: number) => Math.min(value, maxDay);
    const randomDay = (min: number, max: number) =>
      randomInt(min, Math.max(min, Math.min(max, maxDay)));

    rows.push({
      date: dateOf(month, day(5)),
      amount: salary * 100,
      payee: 'ООО «Ромашка»',
      purpose: 'Зарплата за месяц',
      categoryId: 'salary',
    });
    rows.push({
      date: dateOf(month, day(10)),
      amount: -randomInt(7800, 9200) * 100,
      payee: 'ЕПД ЖКХ',
      purpose: 'Оплата жилищно-коммунальных услуг',
      categoryId: 'utilities',
    });
    rows.push({
      date: dateOf(month, day(12)),
      amount: -randomInt(1100, 1900) * 100,
      payee: 'Мосэнергосбыт',
      purpose: 'Электроэнергия по счётчику',
      categoryId: 'electricity',
    });
    rows.push({
      date: dateOf(month, day(12)),
      amount: -randomInt(520, 780) * 100,
      payee: 'Мосводоканал',
      purpose: 'Холодная и горячая вода',
      categoryId: 'water',
    });
    rows.push({
      date: dateOf(month, day(12)),
      amount: -randomInt(280, 460) * 100,
      payee: 'Газпром межрегионгаз',
      purpose: 'Газоснабжение',
      categoryId: 'gas',
    });
    rows.push({
      date: dateOf(month, day(18)),
      amount: -699 * 100,
      payee: 'МТС',
      purpose: 'Связь и интернет',
      categoryId: 'internet',
    });
    rows.push({
      date: dateOf(month, day(20)),
      amount: -399 * 100,
      payee: 'Яндекс Плюс',
      purpose: 'Подписка на сервисы',
      categoryId: 'subscriptions',
    });
    rows.push({
      date: dateOf(month, day(22)),
      amount: -2000 * 100,
      payee: 'Метро',
      purpose: 'Пополнение транспортной карты',
      categoryId: 'transport',
    });

    for (let i = 0; i < 4; i += 1) {
      const payees = ['Пятёрочка', 'Магнит', 'ВкусВилл', 'Самокат', 'Лента'];
      rows.push({
        date: dateOf(month, randomDay(6, 27)),
        amount: -randomInt(600, 4200) * 100,
        payee: payees[randomInt(0, payees.length - 1)],
        purpose: 'Покупка продуктов',
        categoryId: 'groceries',
      });
    }

    for (let i = 0; i < 2; i += 1) {
      const payees = ['Шоколадница', 'Яндекс Еда', 'Додо Пицца', 'Кофемания'];
      rows.push({
        date: dateOf(month, randomDay(7, 26)),
        amount: -randomInt(700, 2400) * 100,
        payee: payees[randomInt(0, payees.length - 1)],
        purpose: 'Кафе и рестораны',
        categoryId: 'cafes',
      });
    }

    for (let i = 0; i < 2; i += 1) {
      rows.push({
        date: dateOf(month, randomDay(8, 27)),
        amount: -randomInt(350, 1100) * 100,
        payee: 'Яндекс Go',
        purpose: 'Поездка на такси',
        categoryId: 'taxi',
      });
    }

    rows.push({
      date: dateOf(month, randomDay(10, 25)),
      amount: -randomInt(400, 1600) * 100,
      payee: 'Аптека Горздрав',
      purpose: 'Лекарства',
      categoryId: 'pharmacy',
    });

    if (offset === 2) {
      rows.push({
        date: dateOf(month, day(15)),
        amount: -3200 * 100,
        payee: 'ФНС России',
        purpose: 'Транспортный налог',
        categoryId: 'taxes',
      });
    }
    if (offset === 1) {
      rows.push({
        date: dateOf(month, day(9)),
        amount: -1500 * 100,
        payee: 'ГИБДД',
        purpose: 'Штраф за превышение скорости',
        categoryId: 'fines',
      });
    }
  }

  const now = Date.now();
  const batchId = (await db.batches.add({
    fileName: 'Демо-данные',
    accountId,
    importedAt: now,
    added: 0,
    duplicates: 0,
    skipped: 0,
  }))!;

  const prepared: Omit<Transaction, 'id'>[] = rows
    .filter((row) => categoryIds.has(row.categoryId))
    .map((row) => ({
      accountId,
      date: row.date,
      amount: row.amount,
      payee: row.payee,
      purpose: row.purpose,
      categoryId: row.categoryId,
      hash: makeHash([accountId, row.date, row.amount, row.payee, row.purpose]),
      batchId,
      createdAt: now,
    }));

  const hashes = prepared.map((transaction) => transaction.hash);
  const existing = new Set<string>();
  for (let i = 0; i < hashes.length; i += 300) {
    const found = await db.transactions
      .where('hash')
      .anyOf(hashes.slice(i, i + 300))
      .toArray();
    found.forEach((transaction) => existing.add(transaction.hash));
  }

  const unique = prepared.filter((transaction) => !existing.has(transaction.hash));
  if (unique.length > 0) await db.transactions.bulkAdd(unique as Transaction[]);

  await db.batches.update(batchId, {
    added: unique.length,
    duplicates: prepared.length - unique.length,
  });

  return unique.length;
}

export async function getAccounts(): Promise<Account[]> {
  return db.accounts.toArray();
}
