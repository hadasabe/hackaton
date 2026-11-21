import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Heart, MapPin, Map as MapIcon, MessageCircle, Route as RouteIcon, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import { api } from '../lib/api';
import type { Comment, ReactionValue, WalkRouteSummary } from '../lib/types';
import { useCityObjects } from '../lib/cityObjects';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDuration, plural } from '../lib/format';
import { writePlan } from '../lib/plan';
import { NotFoundPage } from './NotFoundPage';
import { BackLink } from '../components/BackLink';
import { CommentThread } from '../components/CommentThread';

export function RoutePage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { objects } = useCityObjects();
  const [route, setRoute] = useState<WalkRouteSummary | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.walkRoute(slug)
      .then((data) => {
        setRoute(data.route);
        setComments(data.comments);
        setNotFound(false);
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : 'Не удалось загрузить маршрут');
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (notFound) return <NotFoundPage />;
  if (loading || !route) {
    return <main className="page"><div className="detail-skeleton" /></main>;
  }

  const currentRoute = route;
  const byId = new Map(objects.map((object) => [object.id, object]));
  const stops = currentRoute.stops.map((id) => byId.get(id)).filter(Boolean);
  const cover = stops.find((stop) => stop?.image)?.image;

  async function react(value: ReactionValue) {
    if (!user) {
      navigate('/login', { state: { from: `/r/${slug}` } });
      return;
    }
    try {
      const result = await api.reactWalkRoute(currentRoute.id, value);
      setRoute((current) => current ? { ...current, ...result } : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось поставить реакцию');
    }
  }

  async function toggleFavorite() {
    if (!user) {
      navigate('/login', { state: { from: `/r/${slug}` } });
      return;
    }
    try {
      const result = await api.toggleWalkRouteFavorite(currentRoute.id);
      setRoute((current) => current ? { ...current, favorite: result.favorite } : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить маршрут');
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      navigate('/login', { state: { from: `/r/${slug}` } });
      return;
    }
    if (!comment.trim()) return;
    setSending(true);
    try {
      const created = await api.addWalkRouteComment(currentRoute.id, comment.trim());
      setComments((current) => [...current, created]);
      setComment('');
      setRoute((current) => current ? { ...current, comments_count: current.comments_count + 1 } : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить комментарий');
    } finally {
      setSending(false);
    }
  }

  async function reactComment(comment: Comment, value: ReactionValue) {
    if (!user) {
      navigate('/login', { state: { from: `/r/${slug}` } });
      return;
    }
    try {
      const result = await api.reactWalkRouteComment(comment.id, value);
      setComments((current) => current.map((entry) => entry.id === comment.id ? { ...entry, ...result } : entry));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось поставить реакцию');
    }
  }

  async function replyComment(parent: Comment, body: string) {
    if (!user) {
      navigate('/login', { state: { from: `/r/${slug}` } });
      return;
    }
    try {
      const created = await api.addWalkRouteComment(currentRoute.id, body, parent.id);
      setComments((current) => [...current, created]);
      setRoute((current) => current ? { ...current, comments_count: current.comments_count + 1 } : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить ответ');
      throw caught;
    }
  }

  async function deleteComment(comment: Comment) {
    try {
      await api.deleteWalkRouteComment(comment.id);
      setComments((current) => current.map((entry) => entry.id === comment.id
        ? { ...entry, deleted: true, body: '', author_name: 'Комментарий удалён', avatar_url: '', can_delete: false }
        : entry));
      setRoute((current) => current ? { ...current, comments_count: Math.max(0, current.comments_count - 1) } : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить комментарий');
    }
  }

  function startRoute() {
    writePlan(currentRoute.stops);
    navigate('/map?plan=1');
  }

  return (
    <main className="page route-detail-page">
      <BackLink fallback="/routes" />

      <article className="route-detail-hero">
        <div className="route-detail-cover">
          {cover ? <img src={cover} alt="" /> : <RouteIcon size={36} />}
        </div>
        <div className="route-detail-copy">
          <span className="section-kicker">Маршрут · {currentRoute.stops.length} {plural(currentRoute.stops.length, 'остановка', 'остановки', 'остановок')}</span>
          <h1>{currentRoute.title}</h1>
          {currentRoute.description ? <p>{currentRoute.description}</p> : null}
          <div className="route-detail-meta">
            <span>Автор: <Link to={`/u/${currentRoute.owner_id}`} className="author-link">{currentRoute.owner_name}</Link></span>
            <span>{formatDate(currentRoute.created_at)}</span>
            {formatDuration(currentRoute.duration_minutes) ? <span>{formatDuration(currentRoute.duration_minutes)}</span> : null}
          </div>
          <div className="route-detail-actions">
            <button type="button" className={`button button-outline${currentRoute.my_reaction === 'like' ? ' is-saved' : ''}`} onClick={() => void react('like')}>
              <ThumbsUp size={16} /> {currentRoute.likes}
            </button>
            <button type="button" className={`button button-outline${currentRoute.my_reaction === 'dislike' ? ' is-saved' : ''}`} onClick={() => void react('dislike')}>
              <ThumbsDown size={16} /> {currentRoute.dislikes}
            </button>
            <button type="button" className={`button ${currentRoute.favorite ? 'button-dark' : 'button-outline'}`} onClick={() => void toggleFavorite()}>
              <Heart size={16} /> {currentRoute.favorite ? 'В избранном' : 'В избранное'}
            </button>
          </div>
          <div className="route-detail-actions">
            <button type="button" className="button button-dark" onClick={startRoute}><MapIcon size={16} /> Пройти маршрут</button>
            <button type="button" className="button button-outline" onClick={startRoute}><MapPin size={16} /> Карта</button>
          </div>
        </div>
      </article>

      <section className="route-stops-section">
        <h2>Остановки</h2>
        <ol className="route-stops-list">
          {stops.map((object, index) => object ? (
            <li key={object.id}>
              <span>{index + 1}</span>
              {object.image ? <img src={object.image} alt="" loading="lazy" /> : null}
              <div>
                <Link to={object.detailPath}><strong>{object.name}</strong></Link>
                <small>{object.address}</small>
              </div>
            </li>
          ) : null)}
        </ol>
      </section>

      <section className="route-comments-section">
        <h2><MessageCircle size={18} /> Комментарии · {currentRoute.comments_count}</h2>
        <CommentThread
          comments={comments}
          onReact={(comment, value) => void reactComment(comment, value)}
          onReply={(comment, body) => void replyComment(comment, body)}
          onDelete={(comment) => void deleteComment(comment)}
          reportType="route_comment"
          emptyText="Пока нет комментариев."
        />
        <form className="route-comment-form" onSubmit={(event) => void submitComment(event)}>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Что думаете о маршруте?"
            maxLength={800}
            required
          />
          <button type="submit" className="button button-dark" disabled={sending}>
            <Send size={15} /> {sending ? 'Отправляем…' : 'Отправить'}
          </button>
        </form>
      </section>
    </main>
  );
}
