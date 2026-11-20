import { Link, NavLink } from 'react-router-dom';
import { LogOut, Map, ShieldCheck, SprayCan } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Header() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <header className="site-header">
      <Link to="/" className="logo" aria-label="Стена — на главную">
        <span className="logo-mark"><SprayCan size={20} strokeWidth={2.4} /></span>
        <span className="logo-text">
          Стена
          <small>Саратов</small>
        </span>
      </Link>

      <nav className="main-nav" aria-label="Основная навигация">
        <NavLink to="/" end>Лента</NavLink>
        <NavLink to="/collections">Коллекции</NavLink>
        <NavLink to="/walls">Стены</NavLink>
        <NavLink to="/walk" className="nav-walk">
          <Map size={15} />
          Прогулка
        </NavLink>
        {isAdmin ? (
          <NavLink to="/admin" className="nav-admin">
            <ShieldCheck size={15} />
            Модерация
          </NavLink>
        ) : null}
      </nav>

      <div className="header-side">
        {user ? (
          <div className="admin-chip">
            <Link to="/account" className="user-chip-name">{user.name}</Link>
            <button type="button" onClick={() => void logout()} aria-label="Выйти">
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <div className="auth-links">
            <Link to="/login" className="auth-link">Войти</Link>
            <Link to="/register" className="auth-link auth-link-strong">Регистрация</Link>
          </div>
        )}
      </div>
    </header>
  );
}
