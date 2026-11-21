import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Building2, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Header() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const location = useLocation();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);
    if (location.pathname !== '/graffiti') return;
    let lastY = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y > 120 && y > lastY + 4) setHidden(true);
        else if (y < lastY - 4 || y < 40) setHidden(false);
        lastY = y;
        frame = 0;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [location.pathname]);

  return (
    <header className={`site-header${hidden ? ' header-hidden' : ''}`}>
      <Link to="/" className="logo" aria-label="Туристический Саратов — на главную">
        <span className="logo-mark"><Building2 size={20} strokeWidth={2.4} /></span>
        <span className="logo-text">
          Туристический
          <small>Саратов</small>
        </span>
      </Link>

      <nav className="main-nav" aria-label="Основная навигация">
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
