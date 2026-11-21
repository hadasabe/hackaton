import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { api } from '../lib/api';
import { STATUS_META, STATUS_OPTIONS, STYLE_META, STYLE_OPTIONS } from '../lib/constants';
import type { FeedStats, Graffiti, ReactionValue, Status, Style } from '../lib/types';
import { plural } from '../lib/format';
import { GraffitiCard } from '../components/GraffitiCard';
import { useAuth } from '../context/AuthContext';

export function FeedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Graffiti[]>([]);
  const [stats, setStats] = useState<FeedStats | null>(null);
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [style, setStyle] = useState<Style | 'all'>('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.feed({ status, style, q: debouncedQuery });
      setItems(data.items);
      setStats(data.stats);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить ленту');
    } finally {
      setLoading(false);
    }
  }, [status, style, debouncedQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleReact(item: Graffiti, value: ReactionValue) {
    if (!user) {
      navigate('/login', { state: { from: '/' } });
      return;
    }
    let likes = item.likes;
    let dislikes = item.dislikes;
    let myReaction = item.my_reaction;

    if (myReaction === value) {
      if (value === 'like') likes -= 1;
      else dislikes -= 1;
      myReaction = null;
    } else {
      if (myReaction === 'like') likes -= 1;
      if (myReaction === 'dislike') dislikes -= 1;
      if (value === 'like') likes += 1;
      else dislikes += 1;
      myReaction = value;
    }

    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, likes, dislikes, my_reaction: myReaction } : entry,
      ),
    );

    try {
      const result = await api.react(item.id, value);
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, ...result } : entry)),
      );
    } catch {
      void load();
    }
  }

  const total = stats?.total ?? 0;

  return (
    <main className="page">
      <section className="feed-hero">
        <div className="hero-copy">
          <span className="eyebrow">Саратов · уличный архив</span>
          <h1>
            Граффити, пока
            <br />
            их не закрасили
          </h1>
          <p>
            Фотографии, адреса и статусы работ. Архив живой: ставьте лайки, обсуждайте
            и отмечайте, если работа ещё на месте.
          </p>
          <div className="hero-actions">
            <Link to="/submit" className="button button-dark">
              <Plus size={17} />
              Добавить граффити
            </Link>
          </div>
        </div>
        <div className="hero-stats">
          <div className="hero-stat hero-stat-main">
            <strong>{total}</strong>
            <span>{plural(total, 'работа', 'работы', 'работ')} в архиве</span>
          </div>
          <div className="hero-stat">
            <strong>{stats?.alive ?? 0}</strong>
            <span>на месте</span>
          </div>
          <div className="hero-stat">
            <strong>{stats?.erased ?? 0}</strong>
            <span>стёрто</span>
          </div>
          <div className="hero-stat">
            <strong>{stats?.partial ?? 0}</strong>
            <span>частично</span>
          </div>
        </div>
      </section>

      <section id="feed" className="feed-section">
        <div className="feed-toolbar">
          <div className="feed-title">
            <span className="section-kicker">Граффити</span>
            <h2>Свежие работы</h2>
          </div>
          <label className="search-box">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Адрес, автор или описание"
            />
          </label>
        </div>

        <div className="filters-row">
          <div className="chip-row" role="group" aria-label="Статус работы">
            <button
              type="button"
              className={`chip ${status === 'all' ? 'active' : ''}`}
              onClick={() => setStatus('all')}
            >
              Все
            </button>
            {STATUS_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                className={`chip ${status === value ? 'active' : ''}`}
                onClick={() => setStatus(value)}
              >
                {STATUS_META[value].label}
              </button>
            ))}
          </div>
          <label className="select-box">
            <SlidersHorizontal size={15} />
            <select value={style} onChange={(event) => setStyle(event.target.value as Style | 'all')}>
              <option value="all">Все стили</option>
              {STYLE_OPTIONS.map((value) => (
                <option key={value} value={value}>{STYLE_META[value].label}</option>
              ))}
            </select>
          </label>
        </div>

        {error ? <div className="notice error">{error}</div> : null}

        {loading ? (
          <div className="feed-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="card-skeleton" key={index} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="empty-feed">
            <h3>Пока ничего не нашлось</h3>
            <p>Измените фильтры или добавьте первую работу в этом районе.</p>
            <Link to="/submit" className="button button-dark">
              <Plus size={16} />
              Добавить граффити
            </Link>
          </div>
        ) : (
          <div className="feed-grid">
            {items.map((item) => (
              <GraffitiCard
                key={item.id}
                item={item}
                onReact={(value) => void handleReact(item, value)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="submit-banner">
        <div>
          <span className="section-kicker">Архив пополняют люди</span>
          <h2>Знаете работу, которой нет в ленте?</h2>
          <p>Пришлите фото и адрес. Администратор проверит и опубликует.</p>
        </div>
        <Link to="/submit" className="button button-lime">
          Предложить работу <ArrowRight size={17} />
        </Link>
      </section>
    </main>
  );
}
