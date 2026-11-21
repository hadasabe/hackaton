import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import type { UserRelation } from '../lib/types';
import { plural } from '../lib/format';

export function PeopleDialog({
  kind,
  items,
  loading,
  error,
  onClose,
}: {
  kind: 'followers' | 'following';
  items: UserRelation[];
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  return (
    <div className="people-overlay" onClick={onClose}>
      <section className="people-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="section-kicker">Профиль</span>
            <h2>{kind === 'followers' ? 'Подписчики' : 'Подписки'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </header>
        {loading ? <div className="admin-skeleton" /> : null}
        {error ? <div className="notice error">{error}</div> : null}
        {!loading && !error && items.length === 0 ? (
          <p className="people-empty">Здесь пока пусто.</p>
        ) : null}
        <div className="people-list">
          {items.map((person) => (
            <Link to={`/u/${person.id}`} className="people-row" key={person.id} onClick={onClose}>
              <span className="people-avatar">
                {person.avatar_url ? <img src={person.avatar_url} alt="" /> : person.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{person.name}</strong>
                <small>{person.routes_count} {plural(person.routes_count, 'маршрут', 'маршрута', 'маршрутов')}</small>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
