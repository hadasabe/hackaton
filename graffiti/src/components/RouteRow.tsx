import { Link } from 'react-router-dom';
import { ArrowRight, Map as MapIcon } from 'lucide-react';
import type { WalkRouteSummary } from '../lib/types';
import { formatDate, formatDuration, plural } from '../lib/format';

export function RouteRow({ route, showAuthor = false }: { route: WalkRouteSummary; showAuthor?: boolean }) {
  const duration = formatDuration(route.duration_minutes);
  return (
    <Link to={`/r/${route.slug}`} className="account-row account-route-row">
      <span className="account-route-icon"><MapIcon size={24} /></span>
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
