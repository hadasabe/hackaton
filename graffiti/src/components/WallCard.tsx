import { Link } from 'react-router-dom';
import { AtSign, MapPin, Ruler, UserRound } from 'lucide-react';
import { WALL_TERMS_META, WALL_TYPE_META } from '../lib/constants';
import type { Wall } from '../lib/types';

export function WallCard({ wall }: { wall: Wall }) {
  const terms = WALL_TERMS_META[wall.terms];
  return (
    <article className="graffiti-card wall-feed-card">
      <div className="place-card-media">
        <Link to={`/walls/${wall.id}`} className="card-image-link" aria-label={`Открыть стену: ${wall.address}`}>
          <img src={wall.image_path} alt={`Стена: ${wall.address}`} loading="lazy" />
        </Link>
      </div>

      <div className="card-body">
        <div className="card-topline">
          <span className="card-address">
            <MapPin size={13} />
            {wall.address}
          </span>
        </div>

        <div className="tags">
          <span className="tag tag-style">
            {WALL_TYPE_META[wall.type].label}{wall.size ? ` · ${wall.size}` : ''}
          </span>
          <span className="tag" style={{ color: terms.color, background: terms.background }}>
            {terms.label}
          </span>
        </div>

        <h3><Link to={`/walls/${wall.id}`}>{wall.title}</Link></h3>
        {wall.description ? <p className="card-description">{wall.description}</p> : null}
        {wall.contact ? (
          <p className="card-author"><AtSign size={13} /> {wall.contact}</p>
        ) : null}

        <div className="card-actions">
          <span className="wall-card-owner"><UserRound size={14} /> {wall.owner_name}</span>
          {wall.size ? <span className="wall-card-size"><Ruler size={14} /> {wall.size}</span> : null}
          <Link to={`/walls/${wall.id}`} className="reaction comments-link">
            Подробнее →
          </Link>
        </div>
      </div>
    </article>
  );
}
