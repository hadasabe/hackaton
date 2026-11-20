import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Plus,
  UploadCloud,
  X,
} from 'lucide-react';
import { db } from '../lib/db';
import { categorize, createAccount, importTransactions, type ImportOutcome } from '../lib/engine';
import {
  applyMapping,
  autoMap,
  readStatementFile,
  type ColumnMapping,
  type ParsedSheet,
} from '../lib/statement';
import { formatDate, formatMoney } from '../lib/format';
import { Button, Card, CardHeader, Input, PageHeader, Select } from '../components/ui';

const EMPTY_MAPPING: ColumnMapping = {
  date: null,
  amount: null,
  debit: null,
  credit: null,
  payee: null,
  purpose: null,
  type: null,
  category: null,
};

interface MappingField {
  key: keyof ColumnMapping;
  label: string;
  hint?: string;
}

const MAPPING_FIELDS: MappingField[] = [
  { key: 'date', label: 'Дата операции', hint: 'обязательно' },
  { key: 'amount', label: 'Сумма', hint: 'если одна колонка' },
  { key: 'debit', label: 'Расход (дебет)', hint: 'альтернатива сумме' },
  { key: 'credit', label: 'Приход (кредит)', hint: 'альтернатива сумме' },
  { key: 'payee', label: 'Получатель' },
  { key: 'purpose', label: 'Назначение платежа' },
  { key: 'type', label: 'Тип операции', hint: 'если сумма всегда положительная' },
  { key: 'category', label: 'Категория из файла', hint: 'необязательно' },
];

export function ImportPage({
  onGoToTransactions,
}: {
  onGoToTransactions: () => void;
}) {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const rules = useLiveQuery(() => db.rules.toArray(), []);

  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [accountId, setAccountId] = useState<number | ''>('');
  const [result, setResult] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountBank, setNewAccountBank] = useState('');

  useEffect(() => {
    if (accountId === '' && accounts && accounts.length > 0) {
      setAccountId(accounts[0].id ?? '');
    }
  }, [accounts, accountId]);

  const parsed = useMemo(
    () => (sheet ? applyMapping(sheet, mapping) : null),
    [sheet, mapping],
  );

  const mappingValid =
    mapping.date != null && (mapping.amount != null || mapping.debit != null || mapping.credit != null);

  const categoryMap = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories],
  );

  async function handleFile(nextFile: File) {
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const nextSheet = await readStatementFile(nextFile);
      const nextMapping = autoMap(nextSheet.headers);
      setFile(nextFile);
      setSheet(nextSheet);
      setMapping(nextMapping);
    } catch (caught) {
      setFile(null);
      setSheet(null);
      setError(caught instanceof Error ? caught.message : 'Не удалось прочитать файл.');
    } finally {
      setBusy(false);
    }
  }

  function resetFile() {
    setFile(null);
    setSheet(null);
    setMapping(EMPTY_MAPPING);
    setResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  function updateMapping(key: keyof ColumnMapping, value: string) {
    setMapping((current) => ({
      ...current,
      [key]: value === '' ? null : Number(value),
    }));
  }

  async function handleImport() {
    if (!file || !parsed || accountId === '' || !mappingValid) return;
    setBusy(true);
    setError('');
    try {
      const outcome = await importTransactions(
        parsed.transactions,
        Number(accountId),
        file.name,
        parsed.errors.length,
        rules ?? [],
        categories ?? [],
      );
      setResult(outcome);
      setFile(null);
      setSheet(null);
      setMapping(EMPTY_MAPPING);
      if (inputRef.current) inputRef.current.value = '';
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось импортировать операции.');
    } finally {
      setBusy(false);
    }
  }

  async function addAccount() {
    if (!newAccountName.trim()) return;
    const id = await createAccount(newAccountName, newAccountBank);
    setAccountId(id);
    setNewAccountName('');
    setNewAccountBank('');
    setShowNewAccount(false);
  }

  if (result) {
    return (
      <div className="page">
        <PageHeader eyebrow="Импорт" title="Готово" description="Выписка обработана прямо в браузере." />
        <Card className="result-card">
          <div className="result-icon"><CheckCircle2 size={32} /></div>
          <h2>Импорт завершён</h2>
          <p className="muted">Файл не отправлялся на сервер и уже не хранится в приложении.</p>
          <div className="result-stats">
            <div><strong>{result.added}</strong><span>добавлено</span></div>
            <div><strong>{result.duplicates}</strong><span>дублей пропущено</span></div>
            <div><strong>{result.skipped}</strong><span>строк с ошибками</span></div>
            <div><strong>{result.total}</strong><span>всего строк</span></div>
          </div>
          <div className="row gap-8 wrap center">
            <Button onClick={onGoToTransactions}>
              К операциям <ArrowRight size={16} />
            </Button>
            <Button variant="secondary" onClick={() => setResult(null)}>
              Импортировать ещё
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Импорт"
        title="Загрузите выписку"
        description="CSV или XLSX из интернет-банка. Пароль от банка не нужен — файл обрабатывается локально."
      />

      <Card>
        <CardHeader
          title="1. Файл"
          subtitle="Поддерживаются CSV, TXT и XLSX. Кодировка и разделитель определяются автоматически."
          action={
            <a className="text-link" href={`${import.meta.env.BASE_URL}samples/example.csv`} download>
              Скачать пример
            </a>
          }
        />
        {!sheet ? (
          <div
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const dropped = event.dataTransfer.files[0];
              if (dropped) void handleFile(dropped);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
            }}
          >
            <div className="dropzone-icon"><UploadCloud size={28} /></div>
            <strong>{busy ? 'Читаем файл…' : 'Перетащите файл сюда'}</strong>
            <span>или нажмите, чтобы выбрать на устройстве</span>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt,.xlsx"
              hidden
              onChange={(event) => {
                const nextFile = event.target.files?.[0];
                if (nextFile) void handleFile(nextFile);
              }}
            />
          </div>
        ) : (
          <div className="file-chip">
            <div className="file-chip-icon"><FileSpreadsheet size={20} /></div>
            <div>
              <strong>{file?.name}</strong>
              <span>
                {sheet.rows.length} строк · разделитель {sheet.delimiter || '—'} · колонок {sheet.headers.length}
              </span>
            </div>
            <button type="button" className="icon-btn" onClick={resetFile} aria-label="Убрать файл">
              <X size={16} />
            </button>
          </div>
        )}
        {error ? (
          <div className="alert error">
            <AlertCircle size={16} />
            {error}
          </div>
        ) : null}
      </Card>

      {sheet ? (
        <>
          <Card>
            <CardHeader
              title="2. Колонки и счёт"
              subtitle="Мы попробовали определить колонки автоматически. Проверьте, что всё совпало."
              action={
                <button type="button" className="text-link" onClick={() => setShowNewAccount((value) => !value)}>
                  <Plus size={15} /> Новый счёт
                </button>
              }
            />
            <div className="account-row">
              <label>
                <span>Счёт</span>
                <Select
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value === '' ? '' : Number(event.target.value))}
                >
                  <option value="">Выберите счёт</option>
                  {(accounts ?? []).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}{account.bank ? ` · ${account.bank}` : ''}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            {showNewAccount ? (
              <div className="inline-form">
                <Input
                  placeholder="Название счёта"
                  value={newAccountName}
                  onChange={(event) => setNewAccountName(event.target.value)}
                />
                <Input
                  placeholder="Банк (необязательно)"
                  value={newAccountBank}
                  onChange={(event) => setNewAccountBank(event.target.value)}
                />
                <Button type="button" onClick={addAccount} disabled={!newAccountName.trim()}>
                  Добавить
                </Button>
              </div>
            ) : null}

            <div className="mapping-grid">
              {MAPPING_FIELDS.map((field) => (
                <label key={field.key} className={mapping[field.key] == null ? 'mapping-empty' : ''}>
                  <span>
                    {field.label}
                    {field.hint ? <em>{field.hint}</em> : null}
                  </span>
                  <Select
                    value={mapping[field.key] ?? ''}
                    onChange={(event) => updateMapping(field.key, event.target.value)}
                  >
                    <option value="">— не выбрано —</option>
                    {sheet.headers.map((header, index) => (
                      <option key={`${field.key}-${index}`} value={index}>
                        {header || `Колонка ${index + 1}`}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>

            {!mappingValid ? (
              <div className="alert">
                <AlertCircle size={16} />
                Укажите дату и хотя бы один источник суммы: «Сумма» или «Расход/Приход».
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="3. Проверка"
              subtitle={
                parsed
                  ? `Распознано операций: ${parsed.transactions.length}, ошибок: ${parsed.errors.length}`
                  : undefined
              }
              action={
                <Button onClick={handleImport} disabled={busy || !mappingValid || parsed?.transactions.length === 0 || accountId === ''}>
                  {busy ? 'Импортируем…' : 'Импортировать'}
                </Button>
              }
            />

            {parsed && parsed.transactions.length > 0 ? (
              <div className="preview-table">
                <div className="preview-head">
                  <span>Дата</span>
                  <span>Получатель</span>
                  <span>Категория</span>
                  <span className="right">Сумма</span>
                </div>
                {parsed.transactions.slice(0, 10).map((transaction, index) => {
                  const categoryId = categorize(
                    transaction.payee,
                    transaction.purpose,
                    transaction.amount,
                    rules ?? [],
                    categories ?? [],
                    transaction.categoryName,
                  );
                  const category = categoryMap.get(categoryId);
                  return (
                    <div className="preview-row" key={`${transaction.date}-${transaction.payee}-${index}`}>
                      <span>{formatDate(transaction.date)}</span>
                      <div>
                        <strong>{transaction.payee}</strong>
                        <span>{transaction.purpose || 'Без назначения'}</span>
                      </div>
                      <span>{category?.name ?? '—'}</span>
                      <span className={`amount right ${transaction.amount > 0 ? 'positive' : ''}`}>
                        {transaction.amount > 0 ? '+' : ''}
                        {formatMoney(transaction.amount, true)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="chart-empty">Нет распознанных операций. Проверьте настройки колонок.</div>
            )}

            {parsed && parsed.errors.length > 0 ? (
              <div className="alert">
                <AlertCircle size={16} />
                <span>
                  Пропущено строк: {parsed.errors.length}. Например: строка {parsed.errors[0].row} — {parsed.errors[0].message}.
                </span>
              </div>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
}
