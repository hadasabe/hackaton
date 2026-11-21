import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Headphones, Heart, HeartOff, MapPin, Map as MapIcon, MessageCircle, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useCityObjects } from '../lib/cityObjects';
import { getPlaceAudio } from '../lib/audio';
import {
  PLACE_FAVORITES_EVENT,
  readFavoritePlaceIds,
  writeFavoritePlaceIds,
} from '../lib/placeFavorites';
import type { Comment, ReactionValue } from '../lib/types';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { NotFoundPage } from './NotFoundPage';
import { BackLink } from '../components/BackLink';

export function ObjectPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { objects, loading, updatePlace } = useCityObjects();
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readFavoritePlaceIds());
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [commentError, setCommentError] = useState('');

  useEffect(() => {
    const sync = () => setFavoriteIds(readFavoritePlaceIds());
    window.addEventListener('storage', sync);
    window.addEventListener(PLACE_FAVORITES_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(PLACE_FAVORITES_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    api.walkPlace(id)
      .then((data) => {
        setComments(data.comments || []);
        updatePlace(data.item.id, {
          likes: data.item.likes,
          dislikes: data.item.dislikes,
          comments_count: data.item.comments_count,
          my_reaction: data.item.my_reaction,
        });
      })
      .catch(() => setComments([]));
  }, [id, updatePlace]);

  const object = objects.find((item) => item.id === id || item.key === id);
  if (loading) {
    return <main className="page"><div className="detail-skeleton" /></main>;
  }
  if (!object || object.kind === 'graffiti') return <NotFoundPage />;

  const objectId = object.id;
  const place = object.place;
  const image = activeImage || object.image;
  const gallery = (place?.gallery || []).filter((photo) => photo.src !== object.image);
  const isFavorite = favoriteIds.includes(objectId);
  const audio = getPlaceAudio(objectId);
  const mapHref = `/map?place=${encodeURIComponent(objectId)}`;

  function toggleFavorite() {
    const next = isFavorite
      ? favoriteIds.filter((favoriteId) => favoriteId !== objectId)
      : [...favoriteIds, objectId];
    writeFavoritePlaceIds(next);
    setFavoriteIds(next);
  }

  async function react(value: ReactionValue) {
    if (!user) {
      navigate('/login', { state: { from: `/object/${objectId}` } });
      return;
    }
    if (!place) return;
    let likes = place.likes;
    let dislikes = place.dislikes;
    let myReaction = place.my_reaction;
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
    updatePlace(objectId, { likes, dislikes, my_reaction: myReaction });
    try {
      const result = await api.reactWalkPlace(objectId, value);
      updatePlace(objectId, result);
    } catch (caught) {
      updatePlace(objectId, { likes: place.likes, dislikes: place.dislikes, my_reaction: place.my_reaction });
      setCommentError(caught instanceof Error ? caught.message : 'Не удалось поставить реакцию');
    }
  }

  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    if (!user) {
      navigate('/login', { state: { from: `/object/${objectId}` } });
      return;
    }
    if (!comment.trim() || !place) return;
    setSending(true);
    setCommentError('');
    try {
      const created = await api.addWalkPlaceComment(objectId, comment.trim());
      setComments((current) => [...current, created]);
      setComment('');
      updatePlace(objectId, { comments_count: place.comments_count + 1 });
    } catch (caught) {
      setCommentError(caught instanceof Error ? caught.message : 'Не удалось отправить комментарий');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="page object-page">
      <BackLink />

      <article className="object-detail">
        <div className="object-detail-media">
          {image ? (
            <img src={image} alt={object.name} />
          ) : (
            <span className="object-detail-placeholder"><MapPin size={42} /></span>
          )}
          {gallery.length ? (
            <div className="object-thumbs">
              {object.image ? (
                <button type="button" className={image === object.image ? 'active' : ''} onClick={() => setActiveImage(object.image)}>
                  <img src={object.image} alt="" />
                </button>
              ) : null}
              {gallery.map((photo) => (
                <button
                  type="button"
                  key={photo.src}
                  className={image === photo.src ? 'active' : ''}
                  onClick={() => setActiveImage(photo.src)}
                >
                  <img src={photo.src} alt="" />
                </button>
              ))}
            </div>
          ) : null}
          {place?.photo?.author ? (
            <small className="object-photo-credit">
              Фото: {place.photo.author} · {place.photo.license}
            </small>
          ) : null}
        </div>

        <div className="object-detail-copy">
          <div className="object-kicker">
            <span className="tag tag-style">{object.category}</span>
            {place?.era ? <span className="object-era">{place.era}</span> : null}
          </div>
          <h1>{object.name}</h1>
          <p className="object-address"><MapPin size={15} /> {object.address}</p>
          <p className="object-description">{object.description}</p>

          <div className="object-actions">
            {place ? (
              <>
                <button type="button" className={`button button-outline${place.my_reaction === 'like' ? ' is-saved' : ''}`} onClick={() => void react('like')}>
                  <ThumbsUp size={16} /> {place.likes}
                </button>
                <button type="button" className={`button button-outline${place.my_reaction === 'dislike' ? ' is-saved' : ''}`} onClick={() => void react('dislike')}>
                  <ThumbsDown size={16} /> {place.dislikes}
                </button>
              </>
            ) : null}
            <button
              type="button"
              className={`button ${isFavorite ? 'button-dark' : 'button-outline'}`}
              onClick={toggleFavorite}
            >
              {isFavorite ? <HeartOff size={16} /> : <Heart size={16} />}
              {isFavorite ? 'Убрать из избранного' : 'В избранное'}
            </button>
            <Link to={mapHref} className="button button-outline">
              <MapIcon size={16} /> На карте
            </Link>
          </div>

          {audio ? (
            <section className="object-audio">
              <h2><Headphones size={18} /> Аудиогид</h2>
              <audio controls preload="metadata" src={audio.src}>
                Ваш браузер не поддерживает аудио.
              </audio>
            </section>
          ) : null}

          {place?.story ? (
            <section className="object-story">
              <h2>История места</h2>
              {place.story.split(/\n\n+/).map((paragraph) => <p key={paragraph.slice(0, 40)}>{paragraph}</p>)}
              {place.lookFor ? (
                <aside className="object-look-for">
                  <strong>Присмотритесь</strong>
                  <p>{place.lookFor}</p>
                </aside>
              ) : null}
            </section>
          ) : null}

          {place?.sources?.length ? (
            <section className="object-sources">
              <h2>Источники</h2>
              <ul>
                {place.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </article>

      {place ? (
        <section className="object-comments">
          <h2><MessageCircle size={18} /> Комментарии · {place.comments_count}</h2>
          {comments.length ? (
            <div className="object-comments-list">
              {comments.map((item) => (
                <article className="route-comment" key={item.id}>
                  <strong>{item.author_name}</strong>
                  <span>{new Date(item.created_at).toLocaleDateString('ru-RU')}</span>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          ) : <p className="route-comments-empty">Пока нет комментариев.</p>}
          <form className="route-comment-form" onSubmit={(event) => void submitComment(event)}>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Что думаете об этом месте?"
              maxLength={800}
              required
            />
            <button type="submit" className="button button-dark" disabled={sending}>
              <Send size={15} /> {sending ? 'Отправляем…' : 'Отправить'}
            </button>
          </form>
          {commentError ? <div className="notice error">{commentError}</div> : null}
        </section>
      ) : null}
    </main>
  );
}
