import { Link } from 'react-router-dom';
import { AtSign, MapPin, Ruler, UserRound } from 'lucide-react';
import { WALL_TERMS_META, WALL_TYPE_META } from '../lib/constants';
import type { Wall } from '../lib/types';

export function WallCard({ wall }: { wall: Wall }) {
  const terms = WALL_TERMS_META[wall.terms];
  return (
    <article className="wall-card">
      <Link to={`/walls/${wall.id}`} className="wall-image-link">
        <img src={wall.image_path} alt={`Стена: ${wall.address}`} loading="lazy" />
        <span className="wall-terms" style={{ color: terms.color, background: terms.background }}>
          {terms.label}
        </span>
      </Link>
      <div className="wall-body">
        <div className="wall-type">{WALL_TYPE_META[wall.type].label}{wall.size ? ` · ${wall.size}` : ''}</div>
        <h3><Link to={`/walls/${wall.id}`}>{wall.title}</Link></h3>
        <p className="wall-address"><MapPin size={13} /> {wall.address}</p>
        <p className="wall-description">{wall.description}</p>
        {wall.contact ? (
          <p className="wall-contact-line"><AtSign size={13} /> {wall.contact}</p>
        ) : null}
        <div className="wall-footer">
          <span><UserRound size={14} /> {wall.owner_name}</span>
          {wall.size ? <span><Ruler size={14} /> {wall.size}</span> : null}
          <Link to={`/walls/${wall.id}`} className="wall-more">Подробнее →</Link>
        </div>
      </div>
    </article>
  );
}
