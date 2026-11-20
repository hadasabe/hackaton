import {
  ArrowLeftRight,
  Code2,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Tags,
  UploadCloud,
} from 'lucide-react';
import { WalletCards } from './CategoryIcon';

export type View = 'dashboard' | 'transactions' | 'import' | 'categories' | 'settings';

const NAV: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Обзор', icon: LayoutDashboard },
  { id: 'transactions', label: 'Операции', icon: ArrowLeftRight },
  { id: 'import', label: 'Импорт', icon: UploadCloud },
  { id: 'categories', label: 'Категории', icon: Tags },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

export function Sidebar({
  view,
  onChange,
}: {
  view: View;
  onChange: (view: View) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <WalletCards size={20} strokeWidth={2.2} />
        </div>
        <div>
          <strong>Смета</strong>
          <span>расходы из выписки</span>
        </div>
      </div>

      <nav className="nav" aria-label="Основная навигация">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => onChange(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="privacy-note">
          <ShieldCheck size={16} />
          <span>Данные хранятся только в этом браузере</span>
        </div>
        <a
          className="gh-link"
          href="https://github.com/hadasabe/hackaton"
          target="_blank"
          rel="noreferrer"
        >
          <Code2 size={16} />
          <span>Открытый исходный код</span>
        </a>
      </div>
    </aside>
  );
}
