import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { api } from '../lib/api';
import type { Wall } from '../lib/types';
import { WallCard } from '../components/WallCard';
import { useAuth } from '../context/AuthContext';

export function WallsPage() {
  const { user } = useAuth();
  const [walls, setWalls] = useState<Wall[]>([]);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.walls({ q: debounced });
      setWalls(data.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить стены');
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="page">
      <section className="walls-section">
        <div className="feed-toolbar walls-toolbar">
          <div className="feed-title">
            <span className="section-kicker">Каталог</span>
            <h2>Свободные стены</h2>
          </div>
          <label className="search-box walls-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск"
              aria-label="Поиск стен"
            />
          </label>
        </div>

        {error ? <div className="notice error">{error}</div> : null}

        {loading ? (
          <div className="walls-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="card-skeleton wall-skeleton" key={index} />
            ))}
          </div>
        ) : walls.length === 0 ? (
          <div className="empty-feed">
            <h3>Пока свободных стен нет</h3>
            <p>Станьте первым, кто предложит место для работы.</p>
            <Link to={user ? '/walls/new' : '/login'} className="button button-dark">
              <Plus size={16} /> Выложить стену
            </Link>
          </div>
        ) : (
          <div className="walls-grid">
            {walls.map((wall) => <WallCard key={wall.id} wall={wall} />)}
          </div>
        )}
      </section>
    </main>
  );
}
