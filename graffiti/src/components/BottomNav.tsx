import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Map, Rows3, SprayCan, User } from 'lucide-react';

export function BottomNav() {
  const location = useLocation();
  const hidden = location.pathname === '/map' || location.pathname.startsWith('/walk') || location.pathname.startsWith('/r/');

  useEffect(() => {
    document.body.classList.toggle('has-bottom-nav', !hidden);
    return () => document.body.classList.remove('has-bottom-nav');
  }, [hidden]);

  if (hidden) return null;

  const artSection = location.pathname === '/'
    || location.pathname.startsWith('/g/')
    || location.pathname.startsWith('/collections');

  return (
    <nav className="bottom-nav" aria-label="Разделы сайта">
      <NavLink to="/" className={() => (artSection ? 'active' : '')}>
        <Rows3 size={20} />
        <span>Лента</span>
      </NavLink>
      <NavLink to="/map">
        <Map size={20} />
        <span>Карта</span>
      </NavLink>
      <NavLink to="/walls">
        <SprayCan size={20} />
        <span>Стены</span>
      </NavLink>
      <NavLink to="/account">
        <User size={20} />
        <span>Профиль</span>
      </NavLink>
    </nav>
  );
}
