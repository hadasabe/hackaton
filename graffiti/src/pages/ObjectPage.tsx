import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Headphones, Heart, HeartOff, MapPin, Map as MapIcon } from 'lucide-react';
import { useCityObjects } from '../lib/cityObjects';
import { getPlaceAudio } from '../lib/audio';
import {
  PLACE_FAVORITES_EVENT,
  readFavoritePlaceIds,
  writeFavoritePlaceIds,
} from '../lib/placeFavorites';
import { NotFoundPage } from './NotFoundPage';

export function ObjectPage() {
  const { id = '' } = useParams();
  const { objects, loading } = useCityObjects();
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readFavoritePlaceIds());

  useEffect(() => {
    const sync = () => setFavoriteIds(readFavoritePlaceIds());
    window.addEventListener('storage', sync);
    window.addEventListener(PLACE_FAVORITES_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(PLACE_FAVORITES_EVENT, sync);
    };
  }, []);

  const object = objects.find((item) => item.id === id || item.key === id);
  if (loading) {
    return <main className="page"><div className="detail-skeleton" /></main>;
  }
  if (!object || object.kind === 'graffiti') return <NotFoundPage />;

  const objectId = object.id;
  const place = object.place;
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

  return (
    <main className="page object-page">
      <Link to="/" className="back-link"><ArrowLeft size={16} /> К ленте</Link>

      <article className="object-detail">
        <div className="object-detail-media">
          {object.image ? (
            <img src={object.image} alt={object.name} />
          ) : (
            <span className="object-detail-placeholder"><MapPin size={42} /></span>
          )}
          {place?.photo?.author ? (
            <small className="object-photo-credit">
              Фото: {place.photo.author} · {place.photo.license}
            </small>
          ) : null}
        </div>

        <div className="object-detail-copy">
          <div className="object-kicker">
            <span className="tag tag-place">{place ? 'МЕСТО' : 'ЗДАНИЕ'}</span>
            <span className="tag tag-style">{object.category}</span>
            {place?.era ? <span className="object-era">{place.era}</span> : null}
          </div>
          <h1>{object.name}</h1>
          <p className="object-address"><MapPin size={15} /> {object.address}</p>
          <p className="object-description">{object.description}</p>

          <div className="object-actions">
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
    </main>
  );
}
