import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/browser';

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
  delimiter: string;
  headerRowIndex: number;
}

export interface ColumnMapping {
  date: number | null;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  payee: number | null;
  purpose: number | null;
  type: number | null;
  category: number | null;
}

export interface ParsedTransaction {
  date: string;
  amount: number;
  payee: string;
  purpose: string;
  categoryName: string;
}

export interface ParseError {
  row: number;
  message: string;
}

export interface MappingResult {
  transactions: ParsedTransaction[];
  errors: ParseError[];
  total: number;
}

const HEADER_SYNONYMS: Record<keyof ColumnMapping, string[]> = {
  date: [
    'дата операции',
    'дата проводки',
    'дата платежа',
    'дата транзакции',
    'дата',
    'operation date',
    'date',
  ],
  amount: [
    'сумма операции',
    'сумма в валюте счета',
    'сумма платежа',
    'сумма',
    'amount',
  ],
  debit: ['сумма списания', 'расход', 'дебет', 'списание', 'debit'],
  credit: ['сумма зачисления', 'приход', 'кредит', 'зачисление', 'credit'],
  payee: [
    'наименование получателя',
    'получатель платежа',
    'получатель',
    'контрагент',
    'merchant',
    'payee',
  ],
  purpose: [
    'назначение платежа',
    'описание операции',
    'описание',
    'назначение',
    'комментарий',
    'purpose',
    'details',
    'memo',
  ],
  type: ['тип операции', 'вид операции', 'тип', 'operation type'],
  category: ['категория', 'category'],
};

const TYPE_EXPENSE = /(расход|списан|дебет|debit|покупк|оплат|перевод)/i;
const TYPE_INCOME = /(доход|зачисл|кредит|credit|поступ|возврат)/i;

export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).trim();
}

function decodeBuffer(buffer: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1251').decode(buffer);
  }
  return text.replace(/^\uFEFF/, '');
}

function scoreHeaderRow(row: string[]): number {
  let score = 0;
  for (const cell of row) {
    const normalized = normalizeHeader(cell);
    if (!normalized) continue;
    for (const synonyms of Object.values(HEADER_SYNONYMS)) {
      if (synonyms.some((synonym) => normalized === synonym || normalized.includes(synonym))) {
        score += 1;
        break;
      }
    }
  }
  return score;
}

function findHeaderRow(matrix: string[][]): number {
  const limit = Math.min(matrix.length, 20);
  let bestIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < limit; i += 1) {
    const score = scoreHeaderRow(matrix[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestScore >= 2 ? bestIndex : 0;
}

function matrixToSheet(matrix: string[][]): ParsedSheet {
  const nonEmpty = matrix.filter((row) => row.some((cell) => cell.trim() !== ''));
  if (nonEmpty.length === 0) {
    throw new Error('Файл пустой или не удалось прочитать строки.');
  }
  const headerRowIndex = findHeaderRow(nonEmpty);
  const headers = nonEmpty[headerRowIndex].map((header) => header.trim());
  const rows = nonEmpty.slice(headerRowIndex + 1);
  return {
    headers: headers.length > 0 ? headers : rows[0]?.map((_, index) => `Колонка ${index + 1}`) ?? [],
    rows,
    delimiter: '',
    headerRowIndex,
  };
}

export function textToSheet(text: string): ParsedSheet {
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
  });
  const matrix = (parsed.data as unknown[][])
    .filter((row) => Array.isArray(row))
    .map((row) => row.map((cell) => cellToString(cell)));
  const sheet = matrixToSheet(matrix);
  sheet.delimiter = parsed.meta.delimiter;
  return sheet;
}

export async function readStatementFile(file: File): Promise<ParsedSheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const buffer = await file.arrayBuffer();
    return textToSheet(decodeBuffer(buffer));
  }
  if (name.endsWith('.xlsx')) {
    const rows = await readSheet(file);
    const matrix = rows.map((row) => row.map((cell) => cellToString(cell)));
    return matrixToSheet(matrix);
  }
  if (name.endsWith('.xls')) {
    throw new Error('Старый формат .xls не поддерживается. Пересохраните файл в .xlsx или .csv.');
  }
  throw new Error('Поддерживаются файлы .csv, .txt и .xlsx.');
}

function findColumn(headers: string[], synonyms: string[]): number | null {
  const normalized = headers.map((header) => normalizeHeader(header));
  for (const synonym of synonyms) {
    const exact = normalized.findIndex((header) => header === synonym);
    if (exact !== -1) return exact;
  }
  for (const synonym of synonyms) {
    const partial = normalized.findIndex((header) => header.includes(synonym));
    if (partial !== -1) return partial;
  }
  return null;
}

export function autoMap(headers: string[]): ColumnMapping {
  return {
    date: findColumn(headers, HEADER_SYNONYMS.date),
    amount: findColumn(headers, HEADER_SYNONYMS.amount),
    debit: findColumn(headers, HEADER_SYNONYMS.debit),
    credit: findColumn(headers, HEADER_SYNONYMS.credit),
    payee: findColumn(headers, HEADER_SYNONYMS.payee),
    purpose: findColumn(headers, HEADER_SYNONYMS.purpose),
    type: findColumn(headers, HEADER_SYNONYMS.type),
    category: findColumn(headers, HEADER_SYNONYMS.category),
  };
}

export function parseAmount(value: string | null | undefined): number | null {
  if (value == null) return null;
  let raw = String(value).trim();
  if (!raw || raw === '-' || raw === '—') return null;

  let negative = false;
  if (/^\(.*\)$/.test(raw)) {
    negative = true;
    raw = raw.slice(1, -1);
  }
  if (raw.endsWith('-')) {
    negative = true;
    raw = raw.slice(0, -1);
  }

  let cleaned = raw
    .replace(/\s|\u00A0|\u202F/g, '')
    .replace(/[₽$€]/g, '')
    .replace(/[^\d,.\-+]/g, '');

  if (!cleaned) return null;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '');
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  const cents = Math.round(Math.abs(parsed) * 100);
  return negative || parsed < 0 ? -cents : cents;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseDate(value: string | null | undefined): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{5}$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20000 && serial < 70000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return isoFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
  }

  const datePart = raw.split(/[T\s]/)[0];

  let match = datePart.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (match) {
    return isoFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = datePart.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if (match) {
    return isoFromParts(Number(match[3]), Number(match[2]), Number(match[1]));
  }

  match = datePart.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2})$/);
  if (match) {
    const year = Number(match[3]);
    return isoFromParts(year < 70 ? 2000 + year : 1900 + year, Number(match[2]), Number(match[1]));
  }

  return null;
}

function cleanText(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function applyMapping(sheet: ParsedSheet, mapping: ColumnMapping): MappingResult {
  const transactions: ParsedTransaction[] = [];
  const errors: ParseError[] = [];
  let total = 0;

  sheet.rows.forEach((row, index) => {
    const rowNumber = sheet.headerRowIndex + index + 2;
    const rowText = row.join(' ').toLowerCase();
    if (!rowText.trim()) return;
    if (rowText.includes('итого') || rowText.includes('общий оборот')) return;
    total += 1;

    const date = mapping.date != null ? parseDate(row[mapping.date]) : null;
    if (!date) {
      errors.push({ row: rowNumber, message: 'не удалось распознать дату' });
      return;
    }

    let amount: number | null = null;
    if (mapping.debit != null || mapping.credit != null) {
      const debit = mapping.debit != null ? parseAmount(row[mapping.debit]) : null;
      const credit = mapping.credit != null ? parseAmount(row[mapping.credit]) : null;
      if (debit != null && debit !== 0) amount = -Math.abs(debit);
      else if (credit != null && credit !== 0) amount = Math.abs(credit);
    }
    if (amount == null && mapping.amount != null) {
      amount = parseAmount(row[mapping.amount]);
    }

    if (amount == null) {
      errors.push({ row: rowNumber, message: 'не удалось распознать сумму' });
      return;
    }

    if (mapping.type != null) {
      const type = cleanText(row[mapping.type]);
      if (TYPE_EXPENSE.test(type) && !TYPE_INCOME.test(type)) amount = -Math.abs(amount);
      if (TYPE_INCOME.test(type) && !TYPE_EXPENSE.test(type)) amount = Math.abs(amount);
    }

    if (amount === 0) {
      errors.push({ row: rowNumber, message: 'нулевая сумма' });
      return;
    }

    const purpose = mapping.purpose != null ? cleanText(row[mapping.purpose]) : '';
    let payee = mapping.payee != null ? cleanText(row[mapping.payee]) : '';
    if (!payee) payee = purpose.slice(0, 80) || 'Без получателя';

    const categoryName = mapping.category != null ? cleanText(row[mapping.category]) : '';

    transactions.push({ date, amount, payee, purpose, categoryName });
  });

  return { transactions, errors, total };
}

export function makeHash(parts: Array<string | number>): string {
  const source = parts.join('|').toLowerCase().replace(/\s+/g, ' ').trim();
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16)}-${source.length.toString(16)}`;
}
