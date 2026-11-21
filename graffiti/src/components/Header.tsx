import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Building2, Heart, LogOut, Map, Rows3, ShieldCheck, SprayCan } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Header() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const location = useLocation();
  const [hidden, setHidden] = useState(false);
  const artSection = location.pathname === '/'
    || location.pathname.startsWith('/g/')
    || location.pathname.startsWith('/object/')
    || location.pathname.startsWith('/collections');
  const mapSection = location.pathname.startsWith('/map')
    || location.pathname.startsWith('/routes')
    || location.pathname.startsWith('/r/');

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

      <nav className="main-nav header-main-nav" aria-label="Основные разделы">
        <NavLink
          to="/"
          className={({ isActive }) => (isActive || artSection ? 'active' : '')}
        >
          <Rows3 size={17} /> Лента
        </NavLink>
        <NavLink
          to="/map"
          className={({ isActive }) => (isActive || mapSection ? 'active' : '')}
        >
          <Map size={17} /> Карта
        </NavLink>
        <NavLink to="/walls">
          <SprayCan size={17} /> Стены
        </NavLink>
      </nav>

      <div className="header-side">
        {user ? (
          <Link to="/account?tab=favorites" className="header-favorite" aria-label="Избранное" title="Избранное">
            <Heart size={17} />
          </Link>
        ) : null}
        {isAdmin ? (
          <NavLink to="/admin" className="nav-admin header-admin">
            <ShieldCheck size={15} />
            Модерация
          </NavLink>
        ) : null}
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
