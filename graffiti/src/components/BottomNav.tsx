import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Bookmark, Images, Map, SprayCan, User } from 'lucide-react';

export function BottomNav() {
  const location = useLocation();
  const hidden = location.pathname === '/' || location.pathname.startsWith('/walk') || location.pathname.startsWith('/r/');

  useEffect(() => {
    document.body.classList.toggle('has-bottom-nav', !hidden);
    return () => document.body.classList.remove('has-bottom-nav');
  }, [hidden]);

  if (hidden) return null;

  return (
    <nav className="bottom-nav" aria-label="Разделы сайта">
      <NavLink to="/graffiti" end>
        <Images size={20} />
        <span>Граффити</span>
      </NavLink>
      <NavLink to="/collections">
        <Bookmark size={20} />
        <span>Коллекции</span>
      </NavLink>
      <NavLink to="/" className="bottom-nav-mode">
        <Map size={20} />
        <span>Прогулка</span>
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
