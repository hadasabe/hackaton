import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Map as MapIcon, Plus, Route as RouteIcon, Search } from 'lucide-react';
import { api } from '../lib/api';
import type { WalkRouteSummary } from '../lib/types';
import { useCityObjects } from '../lib/cityObjects';
import { formatDate, formatDuration, plural } from '../lib/format';
import { readPlan } from '../lib/plan';
import { useAuth } from '../context/AuthContext';

export function RoutesPage() {
  const { objects } = useCityObjects();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [plan] = useState<string[]>(() => readPlan());
  const [routes, setRoutes] = useState<WalkRouteSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(() => searchParams.get('create') === '1' && plan.length >= 2);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('30');
  const [visibility, setVisibility] = useState<'public' | 'link'>('public');
  const [sending, setSending] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    api.walkRoutes('all')
      .then((data) => setRoutes(data.items))
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Не удалось загрузить маршруты'))
      .finally(() => setLoading(false));
  }, []);

  async function createRoute(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      navigate('/login', { state: { from: '/routes?create=1' } });
      return;
    }
    if (plan.length < 2 || title.trim().length < 2) return;
    setSending(true);
    setCreateError('');
    try {
      const data = await api.createWalkRoute({
        title: title.trim(),
        description: description.trim(),
        duration_minutes: Number(duration),
        visibility,
        stops: plan,
      });
      navigate(`/r/${data.route.slug}`);
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : 'Не удалось создать маршрут');
    } finally {
      setSending(false);
    }
  }

  const byId = new Map(objects.map((object) => [object.id, object]));
  const needle = query.trim().toLowerCase();
  const visible = routes.filter((route) => {
    if (!needle) return true;
    return [route.title, route.description, route.owner_name]
      .some((value) => String(value || '').toLowerCase().includes(needle));
  });

  return (
    <main className="page routes-page">
      <header className="routes-head">
        <div>
          <span className="eyebrow">Маршруты горожан</span>
          <h1>Прогулки<br />по Саратову</h1>
          <p>Готовые маршруты с остановками. Соберите свой на карте или пройдите чужой.</p>
        </div>
        <div className="routes-head-actions">
          {plan.length >= 2 ? (
            <button type="button" className="button button-dark" onClick={() => setShowCreate((value) => !value)}>
              <Plus size={16} /> Опубликовать прогулку
            </button>
          ) : null}
          <Link to="/map" className="button button-outline"><MapIcon size={16} /> Собрать на карте</Link>
        </div>
      </header>

      {showCreate ? (
        <form className="route-create-form" onSubmit={(event) => void createRoute(event)}>
          <div className="route-create-head">
            <div>
              <span className="section-kicker">Новый маршрут · {plan.length} остановок</span>
              <h2>Опубликовать мою прогулку</h2>
            </div>
            <button type="button" className="text-button" onClick={() => setShowCreate(false)}>Свернуть</button>
          </div>
          <div className="route-create-fields">
            <label>Название<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required /></label>
            <label>Описание<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={600} rows={3} /></label>
            <div className="row gap-10 wrap">
              <label>Длительность
                <select value={duration} onChange={(event) => setDuration(event.target.value)}>
                  <option value="30">до 30 минут</option>
                  <option value="60">30–60 минут</option>
                  <option value="90">1–1,5 часа</option>
                  <option value="150">2–2,5 часа</option>
                  <option value="240">2,5–4 часа</option>
                </select>
              </label>
              <label>Доступ
                <select value={visibility} onChange={(event) => setVisibility(event.target.value as 'public' | 'link')}>
                  <option value="public">Для всех</option>
                  <option value="link">Только по ссылке</option>
                </select>
              </label>
            </div>
          </div>
          {createError ? <div className="notice error">{createError}</div> : null}
          <button type="submit" className="button button-dark" disabled={sending}>
            {sending ? 'Создаём…' : 'Создать маршрут'}
          </button>
        </form>
      ) : null}

      <div className="routes-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Название, автор или описание"
          />
        </label>
        <span>{visible.length} {plural(visible.length, 'маршрут', 'маршрута', 'маршрутов')}</span>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {loading ? (
        <div className="routes-grid">
          {Array.from({ length: 3 }).map((_, index) => <div className="card-skeleton" key={index} />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-feed">
          <h3>Маршрутов пока нет</h3>
          <p>Соберите прогулку на карте — она появится здесь.</p>
          <Link to="/map" className="button button-dark"><RouteIcon size={16} /> Открыть карту</Link>
        </div>
      ) : (
        <div className="routes-grid">
          {visible.map((route) => {
            const stops = route.stops.map((id) => byId.get(id)).filter(Boolean);
            const cover = stops.find((stop) => stop?.image)?.image;
            return (
              <Link to={`/r/${route.slug}`} className="route-card" key={route.id}>
                <div className="route-card-cover">
                  {cover ? <img src={cover} alt="" loading="lazy" /> : <RouteIcon size={30} />}
                  <span>{route.stops.length} {plural(route.stops.length, 'остановка', 'остановки', 'остановок')}</span>
                </div>
                <div className="route-card-body">
                  <span className="section-kicker">{formatDuration(route.duration_minutes) || 'Прогулка'}</span>
                  <h2>{route.title}</h2>
                  {route.description ? <p>{route.description}</p> : null}
                  <div className="route-card-meta">
                    <span>{route.owner_name}</span>
                    <span>{formatDate(route.created_at)}</span>
                  </div>
                  <div className="route-card-stats">
                    <span>{route.likes} ♥</span>
                    <span>{route.comments_count} 💬</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
