import { useEffect, useState } from 'react';
import { Sidebar, type View } from './components/Sidebar';
import { ensureSeeded } from './lib/engine';
import { DashboardPage } from './pages/DashboardPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { ImportPage } from './pages/ImportPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureSeeded()
      .catch((error) => console.error('Не удалось подготовить базу', error))
      .finally(() => setReady(true));

    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {
        // Некоторые браузеры не дают постоянное хранилище без действий пользователя.
      });
    }
  }, []);

  if (!ready) {
    return (
      <div className="splash">
        <div className="brand-mark large">
          <span>С</span>
        </div>
        <strong>Смета</strong>
        <span>готовим ваши данные…</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} onChange={setView} />
      <main className="main">
        {view === 'dashboard' ? <DashboardPage onGoToImport={() => setView('import')} /> : null}
        {view === 'transactions' ? <TransactionsPage onGoToImport={() => setView('import')} /> : null}
        {view === 'import' ? <ImportPage onGoToTransactions={() => setView('transactions')} /> : null}
        {view === 'categories' ? <CategoriesPage /> : null}
        {view === 'settings' ? <SettingsPage /> : null}
      </main>
    </div>
  );
}
