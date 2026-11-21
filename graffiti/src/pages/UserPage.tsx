import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, UserCheck, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { WALL_TERMS_META } from '../lib/constants';
import type { UserProfileResponse, UserRelation } from '../lib/types';
import { formatDate, plural } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { NotFoundPage } from './NotFoundPage';
import { RouteRow } from '../components/RouteRow';
import { PeopleDialog } from '../components/PeopleDialog';

type PublicProfileTab = 'routes' | 'walls' | 'buildings';

export function UserPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const profileId = Number(id);
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [tab, setTab] = useState<PublicProfileTab>('routes');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [actionError, setActionError] = useState('');
  const [followBusy, setFollowBusy] = useState(false);
  const [peopleKind, setPeopleKind] = useState<'followers' | 'following' | null>(null);
  const [people, setPeople] = useState<UserRelation[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState('');

  useEffect(() => {
    let alive = true;
    if (!Number.isInteger(profileId) || profileId <= 0) {
      setNotFound(true);
      setLoading(false);
      return () => { alive = false; };
    }
    setLoading(true);
    setNotFound(false);
    setActionError('');
    setTab('routes');
    api.userProfile(profileId)
      .then((data) => {
        if (alive) setProfile(data);
      })
      .catch(() => {
        if (alive) setNotFound(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [profileId, user?.id]);

  if (notFound) return <NotFoundPage />;
  if (loading || !profile) {
    return <main className="page"><div className="detail-skeleton" /></main>;
  }

  const person = profile.user;
  const followers = profile.followers_count;
  const following = profile.following_count;

  async function toggleFollow() {
    if (!profile) return;
    if (!user) {
      navigate('/login', { state: { from: `/u/${profile.user.id}` } });
      return;
    }
    setFollowBusy(true);
    setActionError('');
    try {
      const result = await api.toggleUserFollow(profile.user.id);
      setProfile((current) => current ? {
        ...current,
        is_following: result.following,
        followers_count: result.followers_count,
      } : current);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Не удалось изменить подписку');
    } finally {
      setFollowBusy(false);
    }
  }

  async function openPeople(kind: 'followers' | 'following') {
    if (!profile) return;
    setPeopleKind(kind);
    setPeople([]);
    setPeopleError('');
    setPeopleLoading(true);
    try {
      const data = kind === 'followers'
        ? await api.userFollowers(profile.user.id)
        : await api.userFollowing(profile.user.id);
      setPeople(data.items);
    } catch (caught) {
      setPeopleError(caught instanceof Error ? caught.message : 'Не удалось загрузить список');
    } finally {
      setPeopleLoading(false);
    }
  }

  return (
    <main className="page account-page user-page">
      <header className="page-header profile-page-header">
        <div className="profile-identity">
          <span className="profile-avatar">
            {person.avatar_url ? <img src={person.avatar_url} alt="" /> : person.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <span className="section-kicker">{person.role === 'admin' ? 'Редакция' : 'Горожанин'}</span>
            <h1>{person.name}</h1>
            <p>На сайте с {formatDate(person.created_at)}</p>
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
        <div className="profile-actions">
          {profile.is_me ? (
            <Link to="/account" className="button button-outline">Мой профиль</Link>
          ) : (
            <button
              type="button"
              className={`button ${profile.is_following ? 'button-outline' : 'button-dark'}`}
              onClick={() => void toggleFollow()}
              disabled={followBusy}
            >
              {profile.is_following ? <UserCheck size={16} /> : <UserPlus size={16} />}
              {followBusy ? 'Сохраняем…' : profile.is_following ? 'Вы подписаны' : 'Подписаться'}
            </button>
          )}
        </div>
      </header>

      {actionError ? <div className="notice error">{actionError}</div> : null}

      <div className="account-tabs">
        <button type="button" className={`chip${tab === 'walls' ? ' active' : ''}`} onClick={() => setTab('walls')}>
          Стены <span>{profile.walls.length}</span>
        </button>
        <button type="button" className={`chip${tab === 'buildings' ? ' active' : ''}`} onClick={() => setTab('buildings')}>
          Здания <span>{profile.buildings.length}</span>
        </button>
        <button type="button" className={`chip${tab === 'routes' ? ' active' : ''}`} onClick={() => setTab('routes')}>
          Маршруты <span>{profile.routes.length}</span>
        </button>
      </div>

      {tab === 'routes' ? (
        profile.routes.length ? (
          <div className="account-list">
            {profile.routes.map((route) => <RouteRow route={route} key={route.id} />)}
          </div>
        ) : (
          <div className="empty-feed">
            <h3>Маршрутов пока нет</h3>
            <p>Пользователь ещё не публиковал прогулки.</p>
          </div>
        )
      ) : tab === 'walls' ? (
        profile.walls.length ? (
          <div className="account-list">
            {profile.walls.map((wall) => {
              const terms = WALL_TERMS_META[wall.terms];
              return (
                <Link to={`/walls/${wall.id}`} className="account-row" key={wall.id}>
                  <img src={wall.image_path} alt={wall.address} />
                  <div className="account-row-main">
                    <div className="row gap-8 wrap">
                      <strong>{wall.title}</strong>
                      <span className="tag" style={{ color: terms.color, background: terms.background }}>{terms.label}</span>
                    </div>
                    <span>{wall.address}</span>
                    <small>{formatDate(wall.created_at)}</small>
                  </div>
                  <ArrowRight size={18} />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-feed">
            <h3>Стен пока нет</h3>
            <p>Пользователь ещё не выкладывал стены.</p>
          </div>
        )
      ) : (
        profile.buildings.length ? (
          <div className="account-list">
            {profile.buildings.map((building) => (
              <div className="account-row" key={building.id}>
                <img src={building.image_path} alt={building.address} />
                <div className="account-row-main">
                  <div className="row gap-8 wrap">
                    <strong>{building.title}</strong>
                    <span className="tag">{building.category}</span>
                  </div>
                  <span>{building.address}</span>
                  <small>{formatDate(building.created_at)}</small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-feed">
            <h3>Зданий пока нет</h3>
            <p>Пользователь ещё не добавлял здания.</p>
          </div>
        )
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
