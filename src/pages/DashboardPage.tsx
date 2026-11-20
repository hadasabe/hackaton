import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDaysInMonth, isSameMonth, parseISO } from 'date-fns';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ReceiptText,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db } from '../lib/db';
import { seedDemoData } from '../lib/engine';
import type { Category, Transaction } from '../lib/types';
import {
  formatCompactMoney,
  formatMoney,
  formatShortDate,
  lastMonthKeys,
  monthKey,
  monthLabel,
  monthLabelShort,
  pluralTransactions,
  shiftMonth,
} from '../lib/format';
import { Button, Card, CardHeader, EmptyState } from '../components/ui';
import { CategoryIcon } from '../components/CategoryIcon';

interface CategorySlice {
  id: string;
  name: string;
  value: number;
  color: string;
  icon: string;
}

function sumByKind(transactions: Transaction[], kind: 'expense' | 'income'): number {
  return transactions.reduce((sum, transaction) => {
    if (kind === 'expense' && transaction.amount < 0) return sum + Math.abs(transaction.amount);
    if (kind === 'income' && transaction.amount > 0) return sum + transaction.amount;
    return sum;
  }, 0);
}

function categorySlices(
  transactions: Transaction[],
  categoryMap: Map<string, Category>,
): CategorySlice[] {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.amount >= 0) continue;
    totals.set(
      transaction.categoryId,
      (totals.get(transaction.categoryId) ?? 0) + Math.abs(transaction.amount),
    );
  }
  const slices = [...totals.entries()]
    .map(([id, value]) => {
      const category = categoryMap.get(id);
      return {
        id,
        name: category?.name ?? 'Без категории',
        value,
        color: category?.color ?? '#94a3b8',
        icon: category?.icon ?? 'circle',
      };
    })
    .sort((a, b) => b.value - a.value);

  if (slices.length <= 7) return slices;
  const head = slices.slice(0, 6);
  const rest = slices.slice(6).reduce((sum, slice) => sum + slice.value, 0);
  return [
    ...head,
    { id: 'rest', name: 'Остальное', value: rest, color: '#cbd5e1', icon: 'circle' },
  ];
}

export function DashboardPage({ onGoToImport }: { onGoToImport: () => void }) {
  const [month, setMonth] = useState(monthKey());
  const [seeding, setSeeding] = useState(false);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);

  const categoryMap = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories],
  );

  const monthly = useMemo(
    () => (transactions ?? []).filter((transaction) => transaction.date.startsWith(month)),
    [transactions, month],
  );
  const previous = useMemo(
    () => (transactions ?? []).filter((transaction) => transaction.date.startsWith(shiftMonth(month, -1))),
    [transactions, month],
  );

  const expenses = sumByKind(monthly, 'expense');
  const income = sumByKind(monthly, 'income');
  const prevExpenses = sumByKind(previous, 'expense');
  const balance = income - expenses;
  const expenseDelta = prevExpenses > 0 ? Math.round(((expenses - prevExpenses) / prevExpenses) * 100) : null;
  const slices = categorySlices(monthly, categoryMap);
  const monthDate = parseISO(`${month}-01`);
  const daysInMonth = isSameMonth(monthDate, new Date())
    ? new Date().getDate()
    : getDaysInMonth(monthDate);

  const monthSeries = useMemo(() => {
    const keys = lastMonthKeys(6, month);
    return keys.map((key) => {
      const items = (transactions ?? []).filter((transaction) => transaction.date.startsWith(key));
      return {
        key,
        label: monthLabelShort(key),
        income: sumByKind(items, 'income') / 100,
        expense: sumByKind(items, 'expense') / 100,
      };
    });
  }, [transactions, month]);

  const recent = useMemo(
    () =>
      (transactions ?? [])
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
        .slice(0, 6),
    [transactions],
  );

  async function loadDemo() {
    const account = accounts?.[0];
    if (!account?.id) return;
    setSeeding(true);
    try {
      await seedDemoData(account.id);
      setMonth(monthKey());
    } finally {
      setSeeding(false);
    }
  }

  if (!transactions || !categories) {
    return <div className="skeleton-grid" />;
  }

  if (transactions.length === 0) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <span className="eyebrow">Смета</span>
            <h1>Куда уходят деньги</h1>
            <p>Загрузите выписку из банка — остальное приложение посчитает само.</p>
          </div>
        </header>
        <Card className="hero-card">
          <EmptyState
            icon={<ReceiptText size={30} />}
            title="Пока нет ни одной операции"
            description="Импортируйте CSV или XLSX из интернет-банка. Файл обрабатывается прямо в браузере и никуда не отправляется."
            action={
              <div className="row gap-8 wrap">
                <Button onClick={onGoToImport}>Импортировать выписку</Button>
                <Button variant="secondary" onClick={loadDemo} disabled={seeding}>
                  <Sparkles size={16} />
                  {seeding ? 'Загружаем…' : 'Посмотреть на демо-данных'}
                </Button>
              </div>
            }
          />
        </Card>
        <div className="feature-grid">
          <div className="feature">
            <TrendingDown size={20} />
            <h3>Без доступа к банку</h3>
            <p>Никаких паролей и синхронизации. Только файл, который вы сами выбрали.</p>
          </div>
          <div className="feature">
            <TrendingUp size={20} />
            <h3>Понятные категории</h3>
            <p>Продукты, ЖКХ, налоги, штрафы — с правилами и ручной правкой.</p>
          </div>
          <div className="feature">
            <Wallet size={20} />
            <h3>Данные у вас</h3>
            <p>Всё хранится в IndexedDB на устройстве. Есть экспорт и резервная копия.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Обзор</span>
          <h1>Куда уходят деньги</h1>
          <p>Спокойная аналитика без подключения к банку.</p>
        </div>
        <div className="month-switcher">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Предыдущий месяц">
            <ChevronLeft size={18} />
          </button>
          <span>{monthLabel(month)}</span>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Следующий месяц">
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-head">
            <span>Расходы</span>
            <span className="stat-icon expense"><ArrowUpRight size={16} /></span>
          </div>
          <strong>{formatMoney(expenses)}</strong>
          {expenseDelta != null ? (
            <small className={expenseDelta > 0 ? 'trend bad' : 'trend good'}>
              {expenseDelta > 0 ? '↑' : '↓'} {Math.abs(expenseDelta)}% к прошлому месяцу
            </small>
          ) : (
            <small className="muted">нет данных за прошлый месяц</small>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-head">
            <span>Доходы</span>
            <span className="stat-icon income"><ArrowDownRight size={16} /></span>
          </div>
          <strong>{formatMoney(income)}</strong>
          <small className="muted">{monthly.length} {pluralTransactions(monthly.length)}</small>
        </div>
        <div className="stat-card">
          <div className="stat-head">
            <span>Баланс</span>
            <span className="stat-icon"><Wallet size={16} /></span>
          </div>
          <strong className={balance < 0 ? 'negative' : ''}>{formatMoney(balance)}</strong>
          <small className="muted">доходы минус расходы</small>
        </div>
        <div className="stat-card">
          <div className="stat-head">
            <span>Средний день</span>
            <span className="stat-icon"><TrendingDown size={16} /></span>
          </div>
          <strong>{formatMoney(Math.round(expenses / Math.max(daysInMonth, 1)))}</strong>
          <small className="muted">по расходам месяца</small>
        </div>
      </div>

      <div className="dashboard-grid">
        <Card>
          <CardHeader title="Расходы по категориям" subtitle={monthLabel(month)} />
          {slices.length === 0 ? (
            <div className="chart-empty">В этом месяце ещё нет расходов</div>
          ) : (
            <div className="donut-layout">
              <div className="donut-wrap">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={slices}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={66}
                      outerRadius={98}
                      paddingAngle={2}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {slices.map((slice) => (
                        <Cell key={slice.id} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatMoney(Number(value))}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <span>всего</span>
                  <strong>{formatCompactMoney(expenses)}</strong>
                </div>
              </div>
              <ul className="legend">
                {slices.map((slice) => (
                  <li key={slice.id}>
                    <span className="legend-dot" style={{ background: slice.color }} />
                    <span className="legend-name">{slice.name}</span>
                    <span className="legend-value">{formatMoney(slice.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Динамика" subtitle="Доходы и расходы за 6 месяцев" />
          <ResponsiveContainer width="100%" height={286}>
            <BarChart data={monthSeries} barGap={4}>
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={80}
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(value) => formatCompactMoney(Number(value) * 100)}
              />
              <Tooltip
                formatter={(value, name) => [
                  formatMoney(Number(value) * 100),
                  name === 'income' ? 'Доходы' : 'Расходы',
                ]}
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
              />
              <Bar dataKey="income" fill="#10b981" radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              <Bar dataKey="expense" fill="#f43f5e" radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Последние операции"
          subtitle="Свежие поступления и списания"
          action={
            <button type="button" className="text-link" onClick={() => onGoToImport()}>
              Импортировать ещё
            </button>
          }
        />
        <div className="recent-list">
          {recent.map((transaction) => {
            const category = categoryMap.get(transaction.categoryId);
            return (
              <div className="recent-row" key={transaction.id}>
                <div
                  className="category-avatar"
                  style={{ background: `${category?.color ?? '#94a3b8'}16`, color: category?.color ?? '#64748b' }}
                >
                  <CategoryIcon icon={category?.icon ?? 'circle'} size={18} />
                </div>
                <div className="recent-main">
                  <strong>{transaction.payee}</strong>
                  <span>{category?.name ?? 'Без категории'} · {formatShortDate(transaction.date)}</span>
                </div>
                <span className={`amount ${transaction.amount > 0 ? 'positive' : ''}`}>
                  {transaction.amount > 0 ? '+' : ''}
                  {formatMoney(transaction.amount, true)}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
