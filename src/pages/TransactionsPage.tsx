import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Search, Trash2, UploadCloud } from 'lucide-react';
import { db } from '../lib/db';
import type { Category } from '../lib/types';
import {
  formatDate,
  formatMoney,
  monthKey,
  monthLabel,
  pluralTransactions,
} from '../lib/format';
import { Card, EmptyState, PageHeader, Select } from '../components/ui';

const PAGE_SIZE = 150;

export function TransactionsPage({ onGoToImport }: { onGoToImport: () => void }) {
  const transactions = useLiveQuery(
    () => db.transactions.orderBy('date').reverse().toArray(),
    [],
  );
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);

  const [month, setMonth] = useState<string>('all');
  const [categoryId, setCategoryId] = useState('all');
  const [kind, setKind] = useState('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const categoryMap = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories],
  );
  const accountMap = useMemo(
    () => new Map((accounts ?? []).map((account) => [account.id, account])),
    [accounts],
  );

  const months = useMemo(
    () =>
      [...new Set((transactions ?? []).map((transaction) => transaction.date.slice(0, 7)))]
        .sort()
        .reverse(),
    [transactions],
  );

  useEffect(() => {
    if (month === 'all' && months.length > 0 && !months.includes(monthKey())) {
      setMonth(months[0]);
    }
  }, [months, month]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (transactions ?? []).filter((transaction) => {
      if (month !== 'all' && !transaction.date.startsWith(month)) return false;
      if (categoryId !== 'all' && transaction.categoryId !== categoryId) return false;
      if (kind === 'expense' && transaction.amount >= 0) return false;
      if (kind === 'income' && transaction.amount <= 0) return false;
      if (
        needle &&
        !transaction.payee.toLowerCase().includes(needle) &&
        !transaction.purpose.toLowerCase().includes(needle)
      ) {
        return false;
      }
      return true;
    });
  }, [transactions, month, categoryId, kind, search]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [month, categoryId, kind, search]);

  const totalExpense = filtered
    .filter((transaction) => transaction.amount < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const totalIncome = filtered
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  async function updateCategory(id: number | undefined, nextCategoryId: string) {
    if (!id) return;
    await db.transactions.update(id, { categoryId: nextCategoryId });
  }

  async function removeTransaction(id: number | undefined) {
    if (!id) return;
    if (!window.confirm('Удалить операцию? Это действие нельзя отменить.')) return;
    await db.transactions.delete(id);
  }

  if (!transactions || !categories) {
    return <div className="skeleton-grid" />;
  }

  if (transactions.length === 0) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="Операции"
          title="Все движения по счёту"
          description="Здесь появятся операции после импорта выписки."
        />
        <Card>
          <EmptyState
            icon={<UploadCloud size={30} />}
            title="Операций пока нет"
            description="Загрузите CSV или XLSX из банка, чтобы увидеть расходы и доходы."
            action={<button className="btn btn-primary" type="button" onClick={onGoToImport}>Импортировать выписку</button>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Операции"
        title="Все движения по счёту"
        description={`${filtered.length} ${pluralTransactions(filtered.length)} по выбранным фильтрам`}
        action={
          <div className="tx-summary">
            <span>Расходы <strong>{formatMoney(totalExpense)}</strong></span>
            <span>Доходы <strong className="positive">{formatMoney(totalIncome)}</strong></span>
          </div>
        }
      />

      <Card className="filters-card">
        <div className="filters">
          <label className="search-field">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по получателю или назначению"
            />
          </label>
          <Select value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Месяц">
            <option value="all">Все месяцы</option>
            {months.map((key) => (
              <option key={key} value={key}>{monthLabel(key)}</option>
            ))}
          </Select>
          <Select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            aria-label="Категория"
          >
            <option value="all">Все категории</option>
            {categories
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
              .map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
          </Select>
          <Select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Тип операции">
            <option value="all">Расходы и доходы</option>
            <option value="expense">Только расходы</option>
            <option value="income">Только доходы</option>
          </Select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search size={28} />}
            title="Ничего не нашлось"
            description="Попробуйте изменить фильтры или поисковый запрос."
          />
        </Card>
      ) : (
        <Card className="table-card">
          <div className="tx-table">
            <div className="tx-head">
              <span>Дата</span>
              <span>Получатель</span>
              <span>Категория</span>
              <span>Счёт</span>
              <span className="right">Сумма</span>
              <span />
            </div>
            {filtered.slice(0, limit).map((transaction) => {
              const category = categoryMap.get(transaction.categoryId);
              const account = accountMap.get(transaction.accountId);
              return (
                <div className="tx-row" key={transaction.id}>
                  <span className="tx-date">{formatDate(transaction.date)}</span>
                  <div className="tx-payee">
                    <strong>{transaction.payee}</strong>
                    <span>{transaction.purpose || 'Без назначения'}</span>
                  </div>
                  <div className="tx-category">
                    <span
                      className="category-dot"
                      style={{ background: category?.color ?? '#94a3b8' }}
                    />
                    <select
                      value={transaction.categoryId}
                      onChange={(event) => updateCategory(transaction.id, event.target.value)}
                      aria-label={`Категория для ${transaction.payee}`}
                    >
                      {categories.map((item: Category) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </div>
                  <span className="tx-account">{account?.name ?? '—'}</span>
                  <span className={`amount right ${transaction.amount > 0 ? 'positive' : ''}`}>
                    {transaction.amount > 0 ? '+' : ''}
                    {formatMoney(transaction.amount, true)}
                  </span>
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => removeTransaction(transaction.id)}
                    aria-label="Удалить операцию"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
          {filtered.length > limit ? (
            <div className="table-more">
              <button type="button" className="text-link" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
                <Download size={14} />
                Показать ещё {Math.min(PAGE_SIZE, filtered.length - limit)}
              </button>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
