import { Link } from 'react-router-dom';

export function ContentTabs({ active }: { active: 'feed' | 'collections' }) {
  return (
    <div className="content-tabs" role="tablist" aria-label="Граффити и коллекции">
      <Link
        to="/"
        className={`chip${active === 'feed' ? ' active' : ''}`}
        role="tab"
        aria-selected={active === 'feed'}
      >
        Лента
      </Link>
      <Link
        to="/collections"
        className={`chip${active === 'collections' ? ' active' : ''}`}
        role="tab"
        aria-selected={active === 'collections'}
      >
        Коллекции
      </Link>
    </div>
  );
}
