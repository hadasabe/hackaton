import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Database,
  Code2,
  Download,
  HardDriveDownload,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { db } from '../lib/db';
import { createAccount, ensureSeeded, seedDemoData } from '../lib/engine';
import {
  clearAllData,
  exportBackup,
  exportTransactionsCsv,
  importBackupFile,
} from '../lib/backup';
import { Button, Card, CardHeader, Input, PageHeader } from '../components/ui';

export function SettingsPage() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountBank, setNewAccountBank] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function addAccount() {
    if (!newAccountName.trim()) return;
    await createAccount(newAccountName, newAccountBank);
    setNewAccountName('');
    setNewAccountBank('');
    setMessage('Счёт добавлен.');
  }

  async function handleExportBackup() {
    setBusy(true);
    try {
      await exportBackup();
      setMessage('Резервная копия скачана.');
    } finally {
      setBusy(false);
    }
  }

  async function handleExportCsv() {
    if (!transactions || !categories || !accounts) return;
    exportTransactionsCsv(transactions, categories, accounts);
    setMessage('Операции выгружены в CSV.');
  }

  async function handleBackupImport(file: File) {
    setBusy(true);
    try {
      const result = await importBackupFile(file);
      setMessage(`Из резервной копии добавлено операций: ${result.added}.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Не удалось прочитать резервную копию.');
    } finally {
      setBusy(false);
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  }

  async function handleDemo() {
    if (!accounts?.[0]?.id) return;
    if ((transactions?.length ?? 0) > 0) {
      const confirmed = window.confirm(
        'В приложении уже есть операции. Демо-данные добавятся к ним. Продолжить?',
      );
      if (!confirmed) return;
    }
    setBusy(true);
    try {
      const added = await seedDemoData(accounts[0].id);
      setMessage(added > 0 ? `Добавлено демо-операций: ${added}.` : 'Демо-данные уже загружены.');
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    if (!window.confirm('Удалить все операции, правила и счета? Это действие нельзя отменить.')) return;
    setBusy(true);
    try {
      await clearAllData();
      await ensureSeeded();
      setMessage('Все данные удалены. Приложение вернулось в исходное состояние.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Настройки"
        title="Данные и приватность"
        description="Всё хранится локально в браузере. Экспорт — это ваш способ забрать данные с собой."
      />

      {message ? <div className="alert success"><ShieldCheck size={16} />{message}</div> : null}

      <div className="two-col">
        <Card>
          <CardHeader title="Счета" subtitle="К какому счёту привязывать операции" />
          <div className="account-list">
            {(accounts ?? []).map((account) => (
              <div className="account-item" key={account.id}>
                <span className="category-avatar"><Database size={17} /></span>
                <div>
                  <strong>{account.name}</strong>
                  <span>{account.bank || 'банк не указан'}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="inline-form">
            <Input
              placeholder="Название счёта"
              value={newAccountName}
              onChange={(event) => setNewAccountName(event.target.value)}
            />
            <Input
              placeholder="Банк"
              value={newAccountBank}
              onChange={(event) => setNewAccountBank(event.target.value)}
            />
            <Button onClick={addAccount} disabled={!newAccountName.trim()}>
              <Plus size={16} /> Добавить
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Резервная копия" subtitle="JSON со всеми операциями и правилами" />
          <p className="muted small">
            IndexedDB может быть очищена браузером или iOS при нехватке места. Скачивайте копию
            перед важными изменениями.
          </p>
          <div className="stack gap-8">
            <Button onClick={handleExportBackup} disabled={busy}>
              <HardDriveDownload size={16} /> Скачать резервную копию
            </Button>
            <Button variant="secondary" onClick={() => backupInputRef.current?.click()} disabled={busy}>
              <Upload size={16} /> Загрузить резервную копию
            </Button>
            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleBackupImport(file);
              }}
            />
            <Button variant="secondary" onClick={handleExportCsv} disabled={busy || !transactions?.length}>
              <Download size={16} /> Экспортировать операции в CSV
            </Button>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Демо-данные" subtitle="Шесть месяцев операций для быстрого знакомства" />
        <div className="row gap-8 wrap">
          <Button variant="secondary" onClick={handleDemo} disabled={busy}>
            <Sparkles size={16} /> Загрузить демо-данные
          </Button>
          <span className="muted small">Зарплата, ЖКХ, продукты, налоги и штрафы — всё в рублях.</span>
        </div>
      </Card>

      <Card className="danger-card">
        <CardHeader title="Опасная зона" subtitle="Необратимые действия" />
        <div className="row between wrap gap-12">
          <p className="muted small">
            Удалить все операции, счета, правила и категории. Скачайте резервную копию заранее.
          </p>
          <Button variant="danger" onClick={handleClear} disabled={busy}>
            <Trash2 size={16} /> Удалить все данные
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="О приложении" subtitle="Смета 0.1.0" />
        <div className="about-grid">
          <div>
            <h3><ShieldCheck size={17} /> Приватность</h3>
            <p>Нет аккаунтов, сервера и телеметрии. Файл выписки парсится в браузере, исходник не сохраняется.</p>
          </div>
          <div>
            <h3><Code2 size={17} /> Открытый код</h3>
            <p>
              Исходники на{' '}
              <a href="https://github.com/hadasabe/hackaton" target="_blank" rel="noreferrer">GitHub</a>.
              Лицензия AGPL-3.0.
            </p>
          </div>
          <div>
            <h3><Database size={17} /> Хранение</h3>
            <p>IndexedDB в этом браузере. На iPhone добавьте сайт на экран «Домой», чтобы данные жили дольше.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
