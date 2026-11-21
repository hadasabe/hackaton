import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowRight, Heart, HeartOff, Map as MapIcon, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { WALL_TERMS_META } from '../lib/constants';
import type { Graffiti, UserProfileResponse, UserRelation, WalkBuilding, WalkPlace, WalkRouteSummary, Wall } from '../lib/types';
import { formatDate, plural } from '../lib/format';
import { PLACE_FAVORITES_EVENT, readFavoritePlaceIds, removeFavoritePlace } from '../lib/placeFavorites';
import { useAuth } from '../context/AuthContext';
import { RouteRow } from '../components/RouteRow';
import { PeopleDialog } from '../components/PeopleDialog';

type ProfileTab = 'walls' | 'buildings' | 'routes' | 'favorites';

function isProfileTab(value: string | null): value is ProfileTab {
  return value === 'walls' || value === 'buildings' || value === 'routes' || value === 'favorites';
}

function GraffitiRow({ item, onRemove }: { item: Graffiti; onRemove: (item: Graffiti) => void }) {
  return (
    <article className="account-row account-place-row">
      <img src={item.image_path} alt={item.address} />
      <div className="account-row-main">
        <div className="row gap-8 wrap">
          <strong>{item.address}</strong>
          <span className="tag">Граффити</span>
        </div>
        {item.description ? <small>{item.description}</small> : null}
        <small>{item.likes} ♥ · {item.comments_count} 💬</small>
      </div>
      <Link to={`/g/${item.id}`} className="button button-outline">Открыть</Link>
      <button
        type="button"
        className="button button-outline account-remove"
        onClick={() => onRemove(item)}
        aria-label={`Убрать из избранного: ${item.address}`}
      >
        <HeartOff size={16} />
        Убрать
      </button>
    </article>
  );
}

function PlaceRow({ place, onRemove }: { place: WalkPlace; onRemove: (id: string) => void }) {
  return (
    <article className="account-row account-place-row">
      {place.image ? (
        <img src={place.image} alt={place.address} />
      ) : (
        <span className="account-placeholder" aria-hidden="true"><Heart size={23} /></span>
      )}
      <div className="account-row-main">
        <div className="row gap-8 wrap">
          <strong>{place.name}</strong>
          <span className="tag">{place.artType || place.category}</span>
        </div>
        <span>{place.address}</span>
        {place.description ? <small>{place.description}</small> : null}
      </div>
      <button
        type="button"
        className="button button-outline account-remove"
        onClick={() => onRemove(place.id)}
        aria-label={`Убрать из избранного: ${place.name}`}
      >
        <HeartOff size={16} />
        Убрать
      </button>
    </article>
  );
}

export function AccountPage() {
  const { user, refresh } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [walls, setWalls] = useState<Wall[]>([]);
  const [buildings, setBuildings] = useState<WalkBuilding[]>([]);
  const [routes, setRoutes] = useState<WalkRouteSummary[]>([]);
  const [favorites, setFavorites] = useState<WalkRouteSummary[]>([]);
  const [favoriteGraffiti, setFavoriteGraffiti] = useState<Graffiti[]>([]);
  const [places, setPlaces] = useState<WalkPlace[]>([]);
  const [favoritePlaceIds, setFavoritePlaceIds] = useState<string[]>(() => readFavoritePlaceIds());
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [tab, setTab] = useState<ProfileTab>(() => {
    const requested = searchParams.get('tab');
    return isProfileTab(requested) ? requested : 'walls';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [avatarSaving, setAvatarSaving] = useState(false);
  const avatarInput = useRef<HTMLInputElement | null>(null);
  const [peopleKind, setPeopleKind] = useState<'followers' | 'following' | null>(null);
  const [people, setPeople] = useState<UserRelation[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState('');

  useEffect(() => {
    const requested = searchParams.get('tab');
    if (isProfileTab(requested)) setTab(requested);
  }, [searchParams]);

  useEffect(() => {
    const syncFavorites = () => setFavoritePlaceIds(readFavoritePlaceIds());
    window.addEventListener('storage', syncFavorites);
    window.addEventListener(PLACE_FAVORITES_EVENT, syncFavorites);
    return () => {
      window.removeEventListener('storage', syncFavorites);
      window.removeEventListener(PLACE_FAVORITES_EVENT, syncFavorites);
    };
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    const [wallsResult, buildingsResult, routesResult, favoritesResult, favoriteGraffitiResult, profileResult, placesResult] = await Promise.allSettled([
      api.myWalls(),
      api.myWalkBuildings(),
      api.myWalkRoutes(),
      api.favoriteWalkRoutes(),
      api.favoriteGraffiti(),
      api.userProfile(user.id),
      api.walkPlaces(),
    ]);
    if (wallsResult.status === 'fulfilled') setWalls(wallsResult.value.items);
    else setError('Не удалось загрузить стены');
    if (buildingsResult.status === 'fulfilled') setBuildings(buildingsResult.value.items);
    if (routesResult.status === 'fulfilled') setRoutes(routesResult.value.items);
    if (favoritesResult.status === 'fulfilled') setFavorites(favoritesResult.value.items);
    if (favoriteGraffitiResult.status === 'fulfilled') setFavoriteGraffiti(favoriteGraffitiResult.value.items);
    if (profileResult.status === 'fulfilled') setProfile(profileResult.value);
    if (placesResult.status === 'fulfilled') setPlaces(placesResult.value.items);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) return null;

  const followers = profile?.followers_count || 0;
  const following = profile?.following_count || 0;
  const email = profile?.user.email || user.email;
  const placeById = new Map(places.map((place) => [place.id, place]));
  const favoritePlaces = favoritePlaceIds
    .map((id) => placeById.get(id))
    .filter((place): place is WalkPlace => Boolean(place));

  async function changeAvatar(file: File | undefined) {
    if (!file) return;
    setAvatarSaving(true);
    setError('');
    try {
      const form = new FormData();
      form.append('avatar', file);
      await api.uploadAvatar(form);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить аватар');
    } finally {
      setAvatarSaving(false);
    }
  }

  async function openPeople(kind: 'followers' | 'following') {
    if (!user) return;
    setPeopleKind(kind);
    setPeople([]);
    setPeopleError('');
    setPeopleLoading(true);
    try {
      const data = kind === 'followers'
        ? await api.userFollowers(user.id)
        : await api.userFollowing(user.id);
      setPeople(data.items);
    } catch (caught) {
      setPeopleError(caught instanceof Error ? caught.message : 'Не удалось загрузить список');
    } finally {
      setPeopleLoading(false);
    }
  }

  function selectTab(next: ProfileTab) {
    setTab(next);
    setSearchParams(next === 'walls' ? {} : { tab: next }, { replace: true });
  }

  function forgetPlace(id: string) {
    setFavoritePlaceIds(removeFavoritePlace(id));
  }

  async function forgetGraffiti(item: Graffiti) {
    setFavoriteGraffiti((current) => current.filter((entry) => entry.id !== item.id));
    try {
      await api.toggleGraffitiFavorite(item.id);
    } catch {
      setFavoriteGraffiti((current) => [...current, item]);
    }
  }

  return (
    <main className="page account-page">
      <header className="page-header profile-page-header">
        <div className="profile-identity">
          <button
            type="button"
            className={`profile-avatar profile-avatar-button${avatarSaving ? ' is-saving' : ''}`}
            onClick={() => avatarInput.current?.click()}
            aria-label="Изменить аватар"
          >
            {user.avatar_url ? <img src={user.avatar_url} alt="" /> : user.name.slice(0, 1).toUpperCase()}
            <span className="profile-avatar-plus"><Plus size={13} /></span>
          </button>
          <input
            ref={avatarInput}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => void changeAvatar(event.target.files?.[0])}
          />
          <div>
            <h1>{user.name}</h1>
            <p>{email}</p>
            <div className="profile-stats">
              <button type="button" className="profile-stat" onClick={() => void openPeople('followers')}>
                <strong>{followers}</strong><span>{plural(followers, 'подписчик', 'подписчика', 'подписчиков')}</span>
              </button>
              <button type="button" className="profile-stat" onClick={() => void openPeople('following')}>
                <strong>{following}</strong><span>{plural(following, 'подписка', 'подписки', 'подписок')}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {location.state?.wallSubmitted ? (
        <div className="notice">
          Стена отправлена на модерацию. Она появится в каталоге после проверки администратора.
        </div>
      ) : null}

      {error ? <div className="notice error">{error}</div> : null}

      <div className="account-tabs">
        <button type="button" className={`chip${tab === 'walls' ? ' active' : ''}`} onClick={() => selectTab('walls')}>
          Стены <span>{walls.length}</span>
        </button>
        <button type="button" className={`chip${tab === 'buildings' ? ' active' : ''}`} onClick={() => selectTab('buildings')}>
          Здания <span>{buildings.length}</span>
        </button>
        <button type="button" className={`chip${tab === 'routes' ? ' active' : ''}`} onClick={() => selectTab('routes')}>
          Маршруты <span>{routes.length}</span>
        </button>
        <button type="button" className={`chip${tab === 'favorites' ? ' active' : ''}`} onClick={() => selectTab('favorites')}>
          Избранное <span>{favoritePlaces.length + favoriteGraffiti.length + favorites.length}</span>
        </button>
      </div>

      {loading ? (
        <div className="account-list">
          {Array.from({ length: 3 }).map((_, index) => <div className="admin-skeleton" key={index} />)}
        </div>
      ) : tab === 'walls' ? (
        walls.length === 0 ? (
          <div className="empty-feed">
            <h3>Вы ещё не выкладывали стены</h3>
            <p>Добавьте свободный фасад, гараж или забор — художники свяжутся с вами напрямую.</p>
            <Link to="/walls/new" className="button button-dark"><Plus size={16} /> Выложить стену</Link>
          </div>
        ) : (
          <div className="account-list">
            {walls.map((wall) => {
              const terms = WALL_TERMS_META[wall.terms];
              return (
                <Link to={`/walls/${wall.id}`} className="account-row" key={wall.id}>
                  <img src={wall.image_path} alt={wall.address} />
                  <div className="account-row-main">
                    <div className="row gap-8 wrap">
                      <strong>{wall.title}</strong>
                      <span className={`moderation-badge ${wall.moderation_status}`}>
                        {wall.moderation_status === 'pending'
                          ? 'на проверке'
                          : wall.moderation_status === 'published'
                            ? 'опубликована'
                            : 'отклонена'}
                      </span>
                      <span className="tag" style={{ color: terms.color, background: terms.background }}>{terms.label}</span>
                    </div>
                    <span>{wall.address}</span>
                    <small>
                      Контакт: {wall.contact || 'не указан'} · {formatDate(wall.created_at)}
                    </small>
                    {wall.moderation_status === 'rejected' && wall.reject_reason ? (
                      <small className="reject-reason">Причина: {wall.reject_reason}</small>
                    ) : null}
                  </div>
                  <ArrowRight size={18} />
                </Link>
              );
            })}
          </div>
        )
      ) : tab === 'buildings' ? (
        buildings.length === 0 ? (
          <div className="empty-feed">
            <h3>Вы ещё не добавляли здания</h3>
            <p>Добавьте здание в «Прогулке» — после проверки оно появится на карте и здесь.</p>
            <Link to="/map" className="button button-dark"><MapIcon size={16} /> Перейти на карту</Link>
          </div>
        ) : (
          <div className="account-list">
            {buildings.map((building) => (
              <div className="account-row" key={building.id}>
                <img src={building.image_path} alt={building.address} />
                <div className="account-row-main">
                  <div className="row gap-8 wrap">
                    <strong>{building.title}</strong>
                    <span className={`moderation-badge ${building.status === 'closed' ? 'rejected' : building.moderation_status}`}>
                      {building.status === 'closed'
                        ? 'удалено'
                        : building.moderation_status === 'pending'
                          ? 'на проверке'
                          : building.moderation_status === 'published'
                            ? 'опубликовано'
                            : 'отклонено'}
                    </span>
                    <span className="tag">{building.category}</span>
                  </div>
                  <span>{building.address}</span>
                  <small>{formatDate(building.created_at)}</small>
                  {building.moderation_status === 'rejected' && building.reject_reason ? (
                    <small className="reject-reason">Причина: {building.reject_reason}</small>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'routes' ? (
        routes.length === 0 ? (
          <div className="empty-feed">
            <h3>Маршрутов пока нет</h3>
            <p>Соберите маршрут на карте и опубликуйте его — он появится здесь.</p>
            <Link to="/map" className="button button-dark"><MapIcon size={16} /> Перейти на карту</Link>
          </div>
        ) : (
          <div className="account-list">
            {routes.map((route) => <RouteRow route={route} key={route.id} />)}
          </div>
        )
      ) : favoritePlaces.length === 0 && favorites.length === 0 ? (
        <div className="empty-feed">
          <h3>В избранном пока пусто</h3>
          <p>Сохраняйте места и маршруты в «Прогулке» — они будут ждать вас здесь.</p>
          <Link to="/map" className="button button-dark"><MapIcon size={16} /> Открыть карту</Link>
        </div>
      ) : (
        <div className="account-favorites">
          {favoritePlaces.length ? (
            <section className="account-favorite-group">
              <div className="account-favorite-head">
                <h2>Места</h2>
                <span>{favoritePlaces.length}</span>
              </div>
              <div className="account-list">
                {favoritePlaces.map((place) => (
                  <PlaceRow place={place} onRemove={forgetPlace} key={place.id} />
                ))}
              </div>
            </section>
          ) : null}
          {favoriteGraffiti.length ? (
            <section className="account-favorite-group">
              <div className="account-favorite-head">
                <h2>Граффити</h2>
                <span>{favoriteGraffiti.length}</span>
              </div>
              <div className="account-list">
                {favoriteGraffiti.map((item) => (
                  <GraffitiRow item={item} onRemove={(entry) => void forgetGraffiti(entry)} key={item.id} />
                ))}
              </div>
            </section>
          ) : null}
          {favorites.length ? (
            <section className="account-favorite-group">
              <div className="account-favorite-head">
                <h2>Маршруты</h2>
                <span>{favorites.length}</span>
              </div>
              <div className="account-list">
                {favorites.map((route) => <RouteRow route={route} showAuthor key={route.id} />)}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {peopleKind ? (
        <PeopleDialog
          kind={peopleKind}
          items={people}
          loading={peopleLoading}
          error={peopleError}
          onClose={() => setPeopleKind(null)}
        />
      ) : null}
    </main>
  );
}
