import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Heart, MapPin, Map as MapIcon, Plus, Search } from 'lucide-react';
import { api } from '../lib/api';
import type { CityObject } from '../lib/cityObjects';
import { useCityObjects } from '../lib/cityObjects';
import type { Graffiti, ReactionValue } from '../lib/types';
import { plural } from '../lib/format';
import { PLACE_FAVORITES_EVENT, readFavoritePlaceIds, writeFavoritePlaceIds } from '../lib/placeFavorites';
import { ContentTabs } from '../components/ContentTabs';
import { GraffitiCard } from '../components/GraffitiCard';
import { useAuth } from '../context/AuthContext';

type FeedKind = 'all' | 'places' | 'graffiti';

function PlaceCard({
  object,
  isFavorite,
  onToggleFavorite,
}: {
  object: CityObject;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
}) {
  const place = object.place;
  const mapHref = `/map?place=${encodeURIComponent(object.id)}`;

  return (
    <article className="graffiti-card place-feed-card">
      <Link to={object.detailPath} className="card-image-link" aria-label={`Открыть объект: ${object.name}`}>
        {object.image ? (
          <img src={object.image} alt={object.name} loading="lazy" />
        ) : (
          <span className="place-feed-placeholder"><MapPin size={30} /></span>
        )}
      </Link>

      <div className="card-body">
        <div className="card-topline">
          <span className="card-address">
            <MapPin size={13} />
            {object.address}
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
            className={`reaction place-favorite${isFavorite ? ' active like' : ''}`}
            onClick={() => onToggleFavorite(object.id)}
            aria-pressed={isFavorite}
            aria-label={`${isFavorite ? 'Убрать из избранного' : 'Сохранить в избранное'}: ${object.name}`}
          >
            <Heart size={16} />
            {isFavorite ? 'В избранном' : 'В избранное'}
          </button>
          <Link to={mapHref} className="reaction comments-link">
            <MapIcon size={16} />
            На карте
          </Link>
        </div>
      </div>
    </article>
  );
}

export function FeedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { objects, places, graffiti, stats, loading, error, updateGraffiti } = useCityObjects();
  const [kind, setKind] = useState<FeedKind>('all');
  const [query, setQuery] = useState('');
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

  function toggleFavoritePlace(id: string) {
    const next = favoritePlaceIds.includes(id)
      ? favoritePlaceIds.filter((placeId) => placeId !== id)
      : [...favoritePlaceIds, id];
    writeFavoritePlaceIds(next);
    setFavoritePlaceIds(next);
  }

  const needle = query.trim().toLowerCase();
  const visibleObjects = objects.filter((object) => {
    if (kind === 'places' && object.kind === 'graffiti') return false;
    if (kind === 'graffiti' && object.kind !== 'graffiti') return false;
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

  const totalObjects = objects.length;
  const graffitiAlive = stats?.alive ?? 0;

  return (
    <main className="page">
      <section className="feed-hero">
        <div className="hero-copy">
          <span className="eyebrow">Саратов · места и стрит-арт</span>
          <h1>
            Лента
            <br />
            города
          </h1>
          <div className="hero-actions">
            <Link to="/map" className="button button-dark">
              <MapIcon size={17} />
              Открыть карту
            </Link>
            <Link to="/submit" className="button button-outline">
              <Plus size={17} />
              Добавить граффити
            </Link>
          </div>
        </div>
        <div className="hero-stats">
          <div className="hero-stat hero-stat-main">
            <strong>{totalObjects}</strong>
            <span>{plural(totalObjects, 'объект', 'объекта', 'объектов')}</span>
          </div>
          <div className="hero-stat">
            <strong>{places.length}</strong>
            <span>{plural(places.length, 'место', 'места', 'мест')}</span>
          </div>
          <div className="hero-stat">
            <strong>{graffiti.length}</strong>
            <span>{plural(graffiti.length, 'граффити', 'граффити', 'граффити')}</span>
          </div>
          <div className="hero-stat">
            <strong>{graffitiAlive}</strong>
            <span>работ на месте</span>
          </div>
        </div>
      </section>

      <ContentTabs active="feed" />

      <section id="feed" className="feed-section">
        <div className="feed-toolbar feed-toolbar-compact">
          <label className="search-box">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название, адрес, автор или описание"
            />
          </label>
        </div>

        <div className="filters-row">
          <div className="chip-row" role="group" aria-label="Тип объекта">
            <button
              type="button"
              className={`chip ${kind === 'all' ? 'active' : ''}`}
              onClick={() => setKind('all')}
            >
              Все · {totalObjects}
            </button>
            <button
              type="button"
              className={`chip ${kind === 'places' ? 'active' : ''}`}
              onClick={() => setKind('places')}
            >
              Места · {places.length}
            </button>
            <button
              type="button"
              className={`chip ${kind === 'graffiti' ? 'active' : ''}`}
              onClick={() => setKind('graffiti')}
            >
              Граффити · {graffiti.length}
            </button>
          </div>
        </div>

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
                />
              ) : (
                <PlaceCard
                  key={object.key}
                  object={object}
                  isFavorite={favoritePlaceIds.includes(object.id)}
                  onToggleFavorite={toggleFavoritePlace}
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
