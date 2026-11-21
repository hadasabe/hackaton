import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, MapPin, Map as MapIcon, Plus, Search } from 'lucide-react';
import { api } from '../lib/api';
import type { FeedStats, Graffiti, ReactionValue, WalkBuilding, WalkPlace } from '../lib/types';
import { plural } from '../lib/format';
import { ContentTabs } from '../components/ContentTabs';
import { GraffitiCard } from '../components/GraffitiCard';
import { useAuth } from '../context/AuthContext';

type FeedKind = 'all' | 'places' | 'graffiti';

type FeedEntry =
  | { kind: 'place'; key: string; place: WalkPlace }
  | { kind: 'graffiti'; key: string; item: Graffiti };

function buildingToPlace(building: WalkBuilding): WalkPlace {
  return {
    id: `building-${building.id}`,
    name: building.title,
    category: building.category || 'Здание',
    address: building.address,
    description: building.description,
    era: 'Добавлено горожанами',
    image: building.image_path,
    lat: building.lat,
    lng: building.lng,
  };
}

function PlaceCard({ place }: { place: WalkPlace }) {
  const href = `/map?place=${encodeURIComponent(place.id)}`;
  return (
    <article className="graffiti-card place-feed-card">
      <Link to={href} className="card-image-link" aria-label={`Открыть на карте: ${place.name}`}>
        {place.image ? (
          <img src={place.image} alt={place.name} loading="lazy" />
        ) : (
          <span className="place-feed-placeholder"><MapPin size={30} /></span>
        )}
      </Link>

      <div className="card-body">
        <div className="card-topline">
          <span className="card-address">
            <MapPin size={13} />
            {place.address}
          </span>
          <span className="card-time">на карте</span>
        </div>

        <div className="tags">
          <span className="tag tag-place">МЕСТО</span>
          {place.category ? <span className="tag tag-style">{place.category}</span> : null}
        </div>

        <h3>{place.name}</h3>
        {place.artist ? <p className="card-author">{place.artist}</p> : null}
        {place.description ? <p className="card-description">{place.description}</p> : null}

        <div className="card-actions">
          <Link to={href} className="reaction comments-link">
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
  const [items, setItems] = useState<Graffiti[]>([]);
  const [places, setPlaces] = useState<WalkPlace[]>([]);
  const [stats, setStats] = useState<FeedStats | null>(null);
  const [kind, setKind] = useState<FeedKind>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [feedResult, placesResult, buildingsResult] = await Promise.allSettled([
      api.feed(),
      api.walkPlaces(),
      api.walkBuildings(),
    ]);

    if (feedResult.status === 'fulfilled') {
      setItems(feedResult.value.items);
      setStats(feedResult.value.stats);
    } else {
      setError('Не удалось загрузить граффити');
    }

    if (placesResult.status === 'fulfilled') {
      const buildings = buildingsResult.status === 'fulfilled'
        ? buildingsResult.value.items.map(buildingToPlace)
        : [];
      setPlaces([...placesResult.value.items, ...buildings]);
    } else if (buildingsResult.status === 'fulfilled') {
      setPlaces(buildingsResult.value.items.map(buildingToPlace));
    } else {
      setError((current) => current || 'Не удалось загрузить места');
    }

    setLoading(false);
  }, []);

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

  const needle = query.trim().toLowerCase();
  const filteredPlaces = places.filter((place) => {
    if (!needle) return true;
    return [place.name, place.address, place.description, place.category, place.era, place.artType, place.artist]
      .some((value) => String(value || '').toLowerCase().includes(needle));
  });
  const filteredGraffiti = items.filter((item) => {
    if (!needle) return true;
    return [item.address, item.author_name, item.description]
      .some((value) => String(value || '').toLowerCase().includes(needle));
  });

  const visiblePlaces = kind === 'graffiti' ? [] : filteredPlaces;
  const visibleGraffiti = kind === 'places' ? [] : filteredGraffiti;
  const entries: FeedEntry[] = [];
  const maxLength = Math.max(visiblePlaces.length, visibleGraffiti.length);
  for (let index = 0; index < maxLength; index += 1) {
    if (visiblePlaces[index]) {
      entries.push({ kind: 'place', key: `place-${visiblePlaces[index].id}`, place: visiblePlaces[index] });
    }
    if (visibleGraffiti[index]) {
      entries.push({ kind: 'graffiti', key: `graffiti-${visibleGraffiti[index].id}`, item: visibleGraffiti[index] });
    }
  }

  const totalObjects = places.length + items.length;
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
          <p>
            Архитектура, история, природа, музеи и граффити — все объекты в одном потоке.
            Открывайте карточки или переходите на карту.
          </p>
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
            <span>{plural(totalObjects, 'объект', 'объекта', 'объектов')} в ленте</span>
          </div>
          <div className="hero-stat">
            <strong>{places.length}</strong>
            <span>{plural(places.length, 'место', 'места', 'мест')}</span>
          </div>
          <div className="hero-stat">
            <strong>{items.length}</strong>
            <span>{plural(items.length, 'граффити', 'граффити', 'граффити')}</span>
          </div>
          <div className="hero-stat">
            <strong>{graffitiAlive}</strong>
            <span>работ на месте</span>
          </div>
        </div>
      </section>

      <ContentTabs active="feed" />

      <section id="feed" className="feed-section">
        <div className="feed-toolbar">
          <div className="feed-title">
            <span className="section-kicker">Все объекты</span>
            <h2>Единая лента</h2>
          </div>
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
              Граффити · {items.length}
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
        ) : entries.length === 0 ? (
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
            {entries.map((entry) => (
              entry.kind === 'place' ? (
                <PlaceCard key={entry.key} place={entry.place} />
              ) : (
                <GraffitiCard
                  key={entry.key}
                  item={entry.item}
                  onReact={(value) => void handleReact(entry.item, value)}
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
