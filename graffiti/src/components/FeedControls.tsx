import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';

export function FeedControls({ active }: { active: 'objects' | 'collections' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const search = query ? `?q=${encodeURIComponent(query)}` : '';

  function changeQuery(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('q', value);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="feed-controls">
      <label className="search-box">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          placeholder="Поиск"
          aria-label="Поиск"
        />
      </label>
      <nav className="feed-switch" aria-label="Объекты и коллекции">
        <Link
          to={{ pathname: '/', search }}
          className={`button ${active === 'objects' ? 'button-dark' : 'button-outline'}`}
        >
          Объекты
        </Link>
        <Link
          to={{ pathname: '/collections', search }}
          className={`button ${active === 'collections' ? 'button-dark' : 'button-outline'}`}
        >
          Коллекции
        </Link>
      </nav>
    </div>
  );
}
