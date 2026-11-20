import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Paintbrush, Plus, Search } from 'lucide-react';
import { api } from '../lib/api';
import { WALL_TERMS_META, WALL_TERMS_OPTIONS } from '../lib/constants';
import type { Wall } from '../lib/types';
import { WallCard } from '../components/WallCard';
import { useAuth } from '../context/AuthContext';

export function WallsPage() {
  const { user } = useAuth();
  const [walls, setWalls] = useState<Wall[]>([]);
  const [terms, setTerms] = useState('all');
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
      const data = await api.walls({ q: debounced, terms });
      setWalls(data.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить стены');
    } finally {
      setLoading(false);
    }
  }, [debounced, terms]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="page">
      <section className="walls-hero">
        <div>
          <span className="eyebrow">Стены и владельцы</span>
          <h1>Есть стена?<br />Дайте её художнику</h1>
          <p>
            Владельцы выкладывают свободные фасады, заборы и гаражи. Художники находят
            место и договариваются напрямую — через сообщения на сайте.
          </p>
          <div className="hero-actions">
            {user ? (
              <Link to="/walls/new" className="button button-dark">
                <Plus size={17} /> Выложить стену
              </Link>
            ) : (
              <Link to="/login" className="button button-dark">
                <Plus size={17} /> Войти и выложить
              </Link>
            )}
            <Link to="/account" className="button button-outline">
              Мои стены и заявки
            </Link>
          </div>
        </div>
        <div className="walls-hero-art">
          <Paintbrush size={54} />
          <strong>Свободно для мурала</strong>
          <span>Фасад · гараж · забор</span>
        </div>
      </section>

      <section className="walls-section">
        <div className="feed-toolbar">
          <div className="feed-title">
            <span className="section-kicker">Каталог</span>
            <h2>Свободные стены</h2>
          </div>
          <label className="search-box">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Адрес, название или описание"
            />
          </label>
        </div>

        <div className="filters-row">
          <div className="chip-row" role="group" aria-label="Условия">
            <button
              type="button"
              className={`chip ${terms === 'all' ? 'active' : ''}`}
              onClick={() => setTerms('all')}
            >
              Все условия
            </button>
            {WALL_TERMS_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                className={`chip ${terms === value ? 'active' : ''}`}
                onClick={() => setTerms(value)}
              >
                {WALL_TERMS_META[value].label}
              </button>
            ))}
          </div>
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
