import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Heart, MapPin, Map as MapIcon, MessageCircle, Plus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { api } from '../lib/api';
import type { CityObject } from '../lib/cityObjects';
import { useCityObjects } from '../lib/cityObjects';
import type { Graffiti, ReactionValue } from '../lib/types';
import { PLACE_FAVORITES_EVENT, readFavoritePlaceIds, writeFavoritePlaceIds } from '../lib/placeFavorites';
import { FeedControls } from '../components/FeedControls';
import { GraffitiCard } from '../components/GraffitiCard';
import { ReportButton } from '../components/ReportButton';
import { TagFilters } from '../components/TagFilters';
import { useCardLink } from '../lib/cardLink';
import { tagsForObject } from '../lib/tags';
import { useAuth } from '../context/AuthContext';

function PlaceCard({
  object,
  isFavorite,
  onToggleFavorite,
  onReact,
}: {
  object: CityObject;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onReact: (value: ReactionValue) => void;
}) {
  const place = object.place;
  const mapHref = `/map?place=${encodeURIComponent(object.id)}`;
  const likes = place?.likes ?? 0;
  const dislikes = place?.dislikes ?? 0;
  const comments = place?.comments_count ?? 0;
  const cardLink = useCardLink(object.detailPath);

  return (
    <article className="graffiti-card place-feed-card" {...cardLink}>
      <div className="place-card-media">
        <Link to={object.detailPath} className="card-image-link" aria-label={`Открыть объект: ${object.name}`}>
          {object.image ? (
            <img src={object.image} alt={object.name} loading="lazy" />
          ) : (
            <span className="place-feed-placeholder"><MapPin size={30} /></span>
          )}
        </Link>
        <button
          type="button"
          className={`place-card-heart${isFavorite ? ' active' : ''}`}
          onClick={() => onToggleFavorite(object.id)}
          aria-pressed={isFavorite}
          aria-label={`${isFavorite ? 'Убрать из избранного' : 'Сохранить в избранное'}: ${object.name}`}
        >
          <Heart size={18} />
        </button>
      </div>

      <div className="card-body">
        <div className="card-topline">
          <span className="card-address">
            <MapPin size={13} />
            <span className="card-address-text">{object.address}</span>
          </span>
        </div>

        <div className="tags">
          {object.category ? <span className="tag tag-style">{object.category}</span> : null}
        </div>

        <h3>{object.name}</h3>
        {object.artist ? <p className="card-author">{object.artist}</p> : null}
        {object.description ? <p className="card-description">{object.description}</p> : null}

        <div className="card-actions">
          <button
            type="button"
            className={`reaction${place?.my_reaction === 'like' ? ' active like' : ''}`}
            onClick={() => onReact('like')}
            aria-label="Нравится"
          >
            <ThumbsUp size={16} />
            {likes}
          </button>
          <button
            type="button"
            className={`reaction${place?.my_reaction === 'dislike' ? ' active dislike' : ''}`}
            onClick={() => onReact('dislike')}
            aria-label="Не нравится"
          >
            <ThumbsDown size={16} />
            {dislikes}
          </button>
          <Link to={object.detailPath} className="reaction place-comments-link">
            <MessageCircle size={16} />
            {comments}
          </Link>
          <Link to={mapHref} className="reaction comments-link">
            <MapIcon size={16} />
            На карте
          </Link>
        </div>

        <div className="card-report-row">
          <ReportButton targetType="place" targetId={place?.id || object.id} title={object.name} className="card-report-link" />
        </div>
      </div>
    </article>
  );
}

export function FeedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { objects, places, graffiti, loading, error, updatePlace, updateGraffiti } = useCityObjects();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const requestedTag = searchParams.get('tag');
  const availableTags = new Set(objects.flatMap((object) => [...tagsForObject(object)]));
  const activeTag = requestedTag && availableTags.has(requestedTag) ? requestedTag : null;
  const [favoritePlaceIds, setFavoritePlaceIds] = useState<string[]>(() => readFavoritePlaceIds());

  useEffect(() => {
    const syncFavorites = () => setFavoritePlaceIds(readFavoritePlaceIds());
    window.addEventListener('storage', syncFavorites);
    window.addEventListener(PLACE_FAVORITES_EVENT, syncFavorites);
    return () => {
      window.removeEventListener('storage', syncFavorites);
      window.removeEventListener(PLACE_FAVORITES_EVENT, syncFavorites);
    };
  }, []);

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

    updateGraffiti(item.id, { likes, dislikes, my_reaction: myReaction });

    try {
      const result = await api.react(item.id, value);
      updateGraffiti(item.id, result);
    } catch {
      updateGraffiti(item.id, item);
    }
  }

  async function handleGraffitiFavorite(item: Graffiti) {
    if (!user) {
      navigate('/login', { state: { from: '/' } });
      return;
    }
    const next = !item.favorite;
    updateGraffiti(item.id, { favorite: next });
    try {
      const result = await api.toggleGraffitiFavorite(item.id);
      updateGraffiti(item.id, { favorite: result.favorite });
    } catch {
      updateGraffiti(item.id, { favorite: item.favorite });
    }
  }

  function toggleFavoritePlace(id: string) {
    const next = favoritePlaceIds.includes(id)
      ? favoritePlaceIds.filter((placeId) => placeId !== id)
      : [...favoritePlaceIds, id];
    writeFavoritePlaceIds(next);
    setFavoritePlaceIds(next);
  }

  async function handlePlaceReact(object: CityObject, value: ReactionValue) {
    if (!user) {
      navigate('/login', { state: { from: '/' } });
      return;
    }
    const place = object.place;
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
    updatePlace(object.id, { likes, dislikes, my_reaction: myReaction });
    try {
      const result = await api.reactWalkPlace(object.id, value);
      updatePlace(object.id, result);
    } catch {
      updatePlace(object.id, { likes: place.likes, dislikes: place.dislikes, my_reaction: place.my_reaction });
    }
  }

  function selectTag(tag: string | null) {
    const next = new URLSearchParams(searchParams);
    if (tag) next.set('tag', tag);
    else next.delete('tag');
    setSearchParams(next, { replace: true });
  }

  const needle = query.trim().toLowerCase();
  const visibleObjects = objects.filter((object) => {
    if (activeTag && !tagsForObject(object).has(activeTag)) return false;
    if (!needle) return true;
    return [
      object.name,
      object.address,
      object.description,
      object.category,
      object.era,
      object.artType,
      object.artist,
    ].some((value) => String(value || '').toLowerCase().includes(needle));
  });


  return (
    <main className="page">
      <FeedControls active="objects" />

      <section id="feed" className="feed-section">
        <TagFilters objects={objects} activeTag={activeTag} onSelect={selectTag} />

        {error ? <div className="notice error">{error}</div> : null}

        {loading ? (
          <div className="feed-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="card-skeleton" key={index} />
            ))}
          </div>
        ) : visibleObjects.length === 0 ? (
          <div className="empty-feed">
            <h3>Пока ничего не нашлось</h3>
            <p>Измените запрос или добавьте объект в ленту.</p>
            <Link to="/submit" className="button button-dark">
              <Plus size={16} />
              Добавить граффити
            </Link>
          </div>
        ) : (
          <div className="feed-grid">
            {visibleObjects.map((object) => (
              object.kind === 'graffiti' && object.graffiti ? (
                <GraffitiCard
                  key={object.key}
                  item={object.graffiti}
                  onReact={(value) => void handleReact(object.graffiti!, value)}
                  isFavorite={Boolean(object.graffiti.favorite)}
                  onToggleFavorite={() => void handleGraffitiFavorite(object.graffiti!)}
                />
              ) : (
                <PlaceCard
                  key={object.key}
                  object={object}
                  isFavorite={favoritePlaceIds.includes(object.id)}
                  onToggleFavorite={toggleFavoritePlace}
                  onReact={(value) => void handlePlaceReact(object, value)}
                />
              )
            ))}
          </div>
        )}
      </section>

      <section className="submit-banner">
        <div>
          <span className="section-kicker">Ленту пополняют люди</span>
          <h2>Знаете место или работу, которых нет в ленте?</h2>
          <p>Пришлите фото граффити — или добавьте своё здание на карте.</p>
        </div>
        <Link to="/submit" className="button button-lime">
          Предложить граффити <ArrowRight size={17} />
        </Link>
      </section>
    </main>
  );
}
