import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Map, Plus, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { WALL_TERMS_META } from '../lib/constants';
import type { UserProfileResponse, WalkBuilding, WalkRouteSummary, Wall } from '../lib/types';
import { formatDate, formatDuration, plural } from '../lib/format';
import { useAuth } from '../context/AuthContext';

type ProfileTab = 'walls' | 'buildings' | 'routes' | 'favorites';

function RouteRow({ route, showAuthor = false }: { route: WalkRouteSummary; showAuthor?: boolean }) {
  const duration = formatDuration(route.duration_minutes);
  return (
    <Link to={`/r/${route.slug}`} className="account-row account-route-row">
      <span className="account-route-icon"><Map size={24} /></span>
      <div className="account-row-main">
        <div className="row gap-8 wrap">
          <strong>{route.title}</strong>
          {duration ? <span className="tag tag-lime">{duration}</span> : null}
          <span className="tag">{route.visibility === 'link' ? 'по ссылке' : 'для всех'}</span>
        </div>
        {route.description ? <span>{route.description}</span> : null}
        <small>
          {showAuthor ? <>Автор: {route.owner_name} · </> : null}
          {route.stops.length} {plural(route.stops.length, 'остановка', 'остановки', 'остановок')}
          {' · '}{route.likes} ♥ · {route.comments_count} 💬 · {formatDate(route.created_at)}
        </small>
      </div>
      <ArrowRight size={18} />
    </Link>
  );
}

export function AccountPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [walls, setWalls] = useState<Wall[]>([]);
  const [buildings, setBuildings] = useState<WalkBuilding[]>([]);
  const [routes, setRoutes] = useState<WalkRouteSummary[]>([]);
  const [favorites, setFavorites] = useState<WalkRouteSummary[]>([]);
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [tab, setTab] = useState<ProfileTab>('walls');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    const [wallsResult, buildingsResult, routesResult, favoritesResult, profileResult] = await Promise.allSettled([
      api.myWalls(),
      api.myWalkBuildings(),
      api.myWalkRoutes(),
      api.favoriteWalkRoutes(),
      api.userProfile(user.id),
    ]);
    if (wallsResult.status === 'fulfilled') setWalls(wallsResult.value.items);
    else setError('Не удалось загрузить стены');
    if (buildingsResult.status === 'fulfilled') setBuildings(buildingsResult.value.items);
    if (routesResult.status === 'fulfilled') setRoutes(routesResult.value.items);
    if (favoritesResult.status === 'fulfilled') setFavorites(favoritesResult.value.items);
    if (profileResult.status === 'fulfilled') setProfile(profileResult.value);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) return null;

  const followers = profile?.followers_count || 0;
  const following = profile?.following_count || 0;
  const email = profile?.user.email || user.email;

  return (
    <main className="page account-page">
      <header className="page-header profile-page-header">
        <div className="profile-identity">
          <span className="profile-avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <span className="eyebrow">Профиль</span>
            <h1>{user.name}</h1>
            <p>{email}</p>
            <div className="profile-stats">
              <span className="profile-stat"><strong>{followers}</strong><span>{plural(followers, 'подписчик', 'подписчика', 'подписчиков')}</span></span>
              <span className="profile-stat"><strong>{following}</strong><span>{plural(following, 'подписка', 'подписки', 'подписок')}</span></span>
            </div>
          </div>
        </div>
        <div className="profile-actions">
          <Link to="/walls/new" className="button button-dark"><Plus size={16} /> Выложить стену</Link>
          <Link to="/walk" className="button button-outline"><Map size={16} /> Прогулка</Link>
          {user.role === 'admin' ? (
            <Link to="/admin" className="button button-outline"><ShieldCheck size={16} /> Модерация</Link>
          ) : null}
        </div>
      </header>

      {location.state?.wallSubmitted ? (
        <div className="notice">
          Стена отправлена на модерацию. Она появится в каталоге после проверки администратора.
        </div>
      ) : null}

      {error ? <div className="notice error">{error}</div> : null}

      <div className="account-tabs">
        <button type="button" className={`chip${tab === 'walls' ? ' active' : ''}`} onClick={() => setTab('walls')}>
          Стены <span>{walls.length}</span>
        </button>
        <button type="button" className={`chip${tab === 'buildings' ? ' active' : ''}`} onClick={() => setTab('buildings')}>
          Здания <span>{buildings.length}</span>
        </button>
        <button type="button" className={`chip${tab === 'routes' ? ' active' : ''}`} onClick={() => setTab('routes')}>
          Маршруты <span>{routes.length}</span>
        </button>
        <button type="button" className={`chip${tab === 'favorites' ? ' active' : ''}`} onClick={() => setTab('favorites')}>
          Избранное <span>{favorites.length}</span>
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
            <Link to="/walk" className="button button-dark"><Map size={16} /> Перейти в прогулку</Link>
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
            <p>Соберите прогулку в разделе «Прогулка» и опубликуйте её — она появится здесь.</p>
            <Link to="/walk" className="button button-dark"><Map size={16} /> Перейти в прогулку</Link>
          </div>
        ) : (
          <div className="account-list">
            {routes.map((route) => <RouteRow route={route} key={route.id} />)}
          </div>
        )
      ) : (
        favorites.length === 0 ? (
          <div className="empty-feed">
            <h3>В избранном пока пусто</h3>
            <p>Сохраняйте маршруты в «Прогулке» — они будут ждать вас здесь.</p>
            <Link to="/walk" className="button button-dark"><Map size={16} /> Смотреть маршруты</Link>
          </div>
        ) : (
          <div className="account-list">
            {favorites.map((route) => <RouteRow route={route} showAuthor key={route.id} />)}
          </div>
        )
      )}
    </main>
  );
}
