import { addMonths, format, parseISO, startOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

const moneyWithCentsFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(minor: number, withCents = false): string {
  const value = minor / 100;
  return (withCents ? moneyWithCentsFormatter : moneyFormatter).format(value);
}

export function formatCompactMoney(minor: number): string {
  const value = Math.abs(minor) / 100;
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace('.0', '')}\u00A0млн\u00A0₽`;
  }
  if (value >= 1000) return `${Math.round(value / 1000)}\u00A0тыс.\u00A0₽`;
  return `${Math.round(value)}\u00A0₽`;
}

export function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy', { locale: ru });
  } catch {
    return iso;
  }
}

export function formatShortDate(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM', { locale: ru });
  } catch {
    return iso;
  }
}

export function monthKey(date = new Date()): string {
  return format(date, 'yyyy-MM');
}

export function monthLabel(key: string): string {
  try {
    return format(parseISO(`${key}-01`), 'LLLL yyyy', { locale: ru });
  } catch {
    return key;
  }
}

export function monthLabelShort(key: string): string {
  try {
    return format(parseISO(`${key}-01`), 'LLL', { locale: ru });
  } catch {
    return key;
  }
}

export function shiftMonth(key: string, delta: number): string {
  const date = parseISO(`${key}-01`);
  return format(addMonths(date, delta), 'yyyy-MM');
}

export function lastMonthKeys(count: number, endKey = monthKey()): string[] {
  const end = parseISO(`${endKey}-01`);
  const first = startOfMonth(addMonths(end, -(count - 1)));
  return Array.from({ length: count }, (_, index) =>
    format(addMonths(first, index), 'yyyy-MM'),
  );
}

export function transactionMonth(iso: string): string {
  return iso.slice(0, 7);
}

export function pluralTransactions(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'операция';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'операции';
  return 'операций';
}
