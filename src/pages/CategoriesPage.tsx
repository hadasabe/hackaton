import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { db } from '../lib/db';
import { DEFAULT_RULES } from '../lib/categories';
import type { Category, Rule } from '../lib/types';
import { formatMoney } from '../lib/format';
import { Button, Card, CardHeader, Input, PageHeader, Select } from '../components/ui';
import { CategoryIcon } from '../components/CategoryIcon';

const KIND_LABEL: Record<Rule['kind'], string> = {
  expense: 'расход',
  income: 'доход',
  any: 'любой',
};

export function CategoriesPage() {
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const rules = useLiveQuery(() => db.rules.orderBy('pattern').toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);

  const [pattern, setPattern] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [kind, setKind] = useState<Rule['kind']>('expense');

  const categoryMap = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories],
  );

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const transaction of transactions ?? []) {
      const current = map.get(transaction.categoryId) ?? { count: 0, total: 0 };
      current.count += 1;
      current.total += Math.abs(transaction.amount);
      map.set(transaction.categoryId, current);
    }
    return map;
  }, [transactions]);

  async function addRule() {
    const value = pattern.trim().toLowerCase();
    if (!value || !categoryId) return;
    await db.rules.add({
      pattern: value,
      categoryId,
      kind,
      createdAt: Date.now(),
    });
    setPattern('');
  }

  async function removeRule(id: number | undefined) {
    if (!id) return;
    await db.rules.delete(id);
  }

  async function restoreDefaults() {
    if (!window.confirm('Добавить стандартные правила? Существующие правила останутся.')) return;
    const existing = new Set((rules ?? []).map((rule) => rule.pattern));
    const missing = DEFAULT_RULES.filter((rule) => !existing.has(rule.pattern));
    if (missing.length > 0) await db.rules.bulkAdd(missing);
  }

  if (!categories || !rules) {
    return <div className="skeleton-grid" />;
  }

  const expenseCategories = categories.filter((category) => category.kind === 'expense');
  const incomeCategories = categories.filter((category) => category.kind === 'income');

  function renderCategories(items: Category[]) {
    return (
      <div className="category-grid">
        {items.map((category) => {
          const stat = stats.get(category.id);
          return (
            <div className="category-card" key={category.id}>
              <span className="category-avatar" style={{ background: `${category.color}16`, color: category.color }}>
                <CategoryIcon icon={category.icon} size={18} />
              </span>
              <div>
                <strong>{category.name}</strong>
                <span>
                  {stat ? `${stat.count} оп. · ${formatMoney(stat.total)}` : 'пока нет операций'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Категории"
        title="Правила и категории"
        description="Правила применяются при импорте: если в получателе или назначении есть слово, операция сразу попадает в нужную категорию."
      />

      <div className="two-col">
        <Card>
          <CardHeader title="Расходы" subtitle={`${expenseCategories.length} категорий`} />
          {renderCategories(expenseCategories)}
        </Card>
        <Card>
          <CardHeader title="Доходы" subtitle={`${incomeCategories.length} категорий`} />
          {renderCategories(incomeCategories)}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Правила категоризации"
          subtitle="Сначала срабатывает самое длинное совпадение"
          action={
            <button type="button" className="text-link" onClick={restoreDefaults}>
              <Sparkles size={15} /> Вернуть стандартные
            </button>
          }
        />
        <div className="rule-form">
          <Input
            placeholder="Слово или часть получателя, например «пятёроч»"
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void addRule();
            }}
          />
          <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Категория</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.kind === 'income' ? '＋ ' : ''}{category.name}
              </option>
            ))}
          </Select>
          <Select value={kind} onChange={(event) => setKind(event.target.value as Rule['kind'])}>
            <option value="expense">Расход</option>
            <option value="income">Доход</option>
            <option value="any">Любой</option>
          </Select>
          <Button onClick={addRule} disabled={!pattern.trim() || !categoryId}>
            <Plus size={16} /> Добавить
          </Button>
        </div>

        <div className="rules-list">
          {rules.length === 0 ? (
            <p className="muted">Правил пока нет. Добавьте первое — оно применится к следующим импортам.</p>
          ) : (
            rules.map((rule) => {
              const category = categoryMap.get(rule.categoryId);
              return (
                <div className="rule-row" key={rule.id}>
                  <code>{rule.pattern}</code>
                  <span className="rule-arrow">→</span>
                  <span className="badge" style={{ color: category?.color, background: `${category?.color ?? '#94a3b8'}14` }}>
                    {category?.name ?? 'Удалённая категория'}
                  </span>
                  <span className="rule-kind">{KIND_LABEL[rule.kind]}</span>
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => removeRule(rule.id)}
                    aria-label="Удалить правило"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
