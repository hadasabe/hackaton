import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Heart, HeartOff, Map as MapIcon, MessageCircle, Plus, Route as RouteIcon, Search, ThumbsDown, ThumbsUp } from 'lucide-react';
import { api } from '../lib/api';
import type { WalkRouteSummary } from '../lib/types';
import { useCityObjects } from '../lib/cityObjects';
import { formatDate, formatDuration, plural } from '../lib/format';
import { readPlan, writePlan } from '../lib/plan';
import { useAuth } from '../context/AuthContext';
import { ReportButton } from '../components/ReportButton';
import { cardLinkProps } from '../lib/cardLink';

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

  async function reactRoute(route: WalkRouteSummary, value: 'like' | 'dislike') {
    if (!user) {
      navigate('/login', { state: { from: '/routes' } });
      return;
    }
    const nextReaction = route.my_reaction === value ? null : value;
    let likes = route.likes;
    let dislikes = route.dislikes;
    if (route.my_reaction === 'like') likes -= 1;
    if (route.my_reaction === 'dislike') dislikes -= 1;
    if (nextReaction === 'like') likes += 1;
    if (nextReaction === 'dislike') dislikes += 1;
    setRoutes((current) => current.map((entry) => entry.id === route.id ? { ...entry, likes, dislikes, my_reaction: nextReaction } : entry));
    try {
      const result = await api.reactWalkRoute(route.id, value);
      setRoutes((current) => current.map((entry) => entry.id === route.id ? { ...entry, ...result } : entry));
    } catch {
      setRoutes((current) => current.map((entry) => entry.id === route.id ? route : entry));
    }
  }

  async function favoriteRoute(route: WalkRouteSummary) {
    if (!user) {
      navigate('/login', { state: { from: '/routes' } });
      return;
    }
    setRoutes((current) => current.map((entry) => entry.id === route.id ? { ...entry, favorite: !entry.favorite } : entry));
    try {
      const result = await api.toggleWalkRouteFavorite(route.id);
      setRoutes((current) => current.map((entry) => entry.id === route.id ? { ...entry, favorite: result.favorite } : entry));
    } catch {
      setRoutes((current) => current.map((entry) => entry.id === route.id ? route : entry));
    }
  }

  function showRouteOnMap(route: WalkRouteSummary) {
    writePlan(route.stops);
    navigate('/map?plan=1');
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
      <div className="routes-toolbar">
        <label className="search-box routes-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск"
            aria-label="Поиск маршрутов"
          />
        </label>
        <div className="routes-toolbar-actions">
          {plan.length >= 2 ? (
            <button type="button" className="button button-dark" onClick={() => setShowCreate((value) => !value)}>
              <Plus size={16} /> Опубликовать маршрут
            </button>
          ) : null}
          <Link to="/map" className="button button-outline"><MapIcon size={16} /> Карта</Link>
        </div>
      </div>

      {showCreate ? (
        <form className="route-create-form" onSubmit={(event) => void createRoute(event)}>
          <div className="route-create-head">
            <div>
              <span className="section-kicker">Новый маршрут · {plan.length} {plural(plan.length, 'остановка', 'остановки', 'остановок')}</span>
              <h2>Опубликовать мой маршрут</h2>
            </div>
            <button type="button" className="button button-outline" onClick={() => setShowCreate(false)}>Отмена</button>
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
          <div className="route-create-actions">
            <Link to="/map?plan=1" className="button button-outline">
              <MapIcon size={16} /> Выбрать места
            </Link>
            <button type="submit" className="button button-dark" disabled={sending}>
              {sending ? 'Создаём…' : 'Создать маршрут'}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <div className="notice error">{error}</div> : null}

      {loading ? (
        <div className="routes-grid">
          {Array.from({ length: 3 }).map((_, index) => <div className="card-skeleton" key={index} />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-feed">
          <h3>Маршрутов пока нет</h3>
          <p>Соберите маршрут на карте — он появится здесь.</p>
          <Link to="/map" className="button button-dark"><RouteIcon size={16} /> Открыть карту</Link>
        </div>
      ) : (
        <div className="routes-grid">
          {visible.map((route) => {
            const stops = route.stops.map((id) => byId.get(id)).filter(Boolean);
            const cover = stops.find((stop) => stop?.image)?.image;
            return (
              <article className="graffiti-card route-feed-card" key={route.id} {...cardLinkProps(`/r/${route.slug}`, navigate)}>
                <div className="place-card-media">
                  <Link to={`/r/${route.slug}`} className="card-image-link" aria-label={`Открыть маршрут: ${route.title}`}>
                    {cover ? <img src={cover} alt="" loading="lazy" /> : <span className="route-cover-placeholder"><RouteIcon size={30} /></span>}
                  </Link>
                  <span className="route-stops-badge">{route.stops.length} {plural(route.stops.length, 'остановка', 'остановки', 'остановок')}</span>
                  <button
                    type="button"
                    className={`place-card-heart${route.favorite ? ' active' : ''}`}
                    onClick={() => void favoriteRoute(route)}
                    aria-pressed={route.favorite}
                    aria-label={`${route.favorite ? 'Убрать из избранного' : 'Сохранить в избранное'}: ${route.title}`}
                  >
                    <Heart size={18} />
                  </button>
                </div>
                <div className="card-body">
                  <div className="card-topline">
                    <span className="card-address"><RouteIcon size={13} /> <Link to={`/u/${route.owner_id}`} className="card-author-link card-address-text">{route.owner_name}</Link></span>
                    <span className="card-time">{formatDate(route.created_at)}</span>
                  </div>
                  <div className="tags">
                    <span className="tag tag-style">{formatDuration(route.duration_minutes) || 'Прогулка'}</span>
                    <span className="tag">{route.visibility === 'link' ? 'по ссылке' : 'для всех'}</span>
                  </div>
                  <h3><Link to={`/r/${route.slug}`}>{route.title}</Link></h3>
                  {route.description ? <p className="card-description">{route.description}</p> : null}
                  <div className="card-actions">
                    <button
                      type="button"
                      className={`reaction${route.my_reaction === 'like' ? ' active like' : ''}`}
                      onClick={() => void reactRoute(route, 'like')}
                      aria-label="Нравится"
                    >
                      <ThumbsUp size={16} /> {route.likes}
                    </button>
                    <button
                      type="button"
                      className={`reaction${route.my_reaction === 'dislike' ? ' active dislike' : ''}`}
                      onClick={() => void reactRoute(route, 'dislike')}
                      aria-label="Не нравится"
                    >
                      <ThumbsDown size={16} /> {route.dislikes}
                    </button>
                    <Link to={`/r/${route.slug}`} className="reaction place-comments-link">
                      <MessageCircle size={16} /> {route.comments_count}
                    </Link>
                    <button type="button" className="reaction comments-link" onClick={() => showRouteOnMap(route)}>
                      <MapIcon size={16} /> На карте
                    </button>
                  </div>
                  <div className="card-report-row">
                    <ReportButton targetType="route" targetId={route.id} title={route.title} className="card-report-link" />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
