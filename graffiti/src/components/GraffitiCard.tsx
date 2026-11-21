import { Link } from 'react-router-dom';
import { Heart, MapPin, Map as MapIcon, MessageCircle, ThumbsDown, ThumbsUp } from 'lucide-react';
import { STATUS_META, STYLE_META } from '../lib/constants';
import type { Graffiti, ReactionValue } from '../lib/types';
import { ReportButton } from './ReportButton';

export function Tags({ item }: { item: Graffiti }) {
  const status = STATUS_META[item.status];
  const style = STYLE_META[item.style];
  return (
    <div className="tags">
      <span
        className="tag tag-status"
        style={{ color: status.color, background: status.background }}
      >
        {status.label}
      </span>
      <span className="tag tag-style">{style.label}</span>
    </div>
  );
}

export function GraffitiCard({
  item,
  onReact,
  isFavorite = false,
  onToggleFavorite,
}: {
  item: Graffiti;
  onReact: (value: ReactionValue) => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  return (
    <article className="graffiti-card">
      <div className="place-card-media">
        <Link to={`/g/${item.id}`} className="card-image-link" aria-label={`Открыть работу: ${item.address}`}>
          <img src={item.image_path} alt={`Граффити: ${item.address}`} loading="lazy" />
        </Link>
        {onToggleFavorite ? (
          <button
            type="button"
            className={`place-card-heart${isFavorite ? ' active' : ''}`}
            onClick={onToggleFavorite}
            aria-pressed={isFavorite}
            aria-label={`${isFavorite ? 'Убрать из избранного' : 'Сохранить в избранное'}: ${item.address}`}
          >
            <Heart size={18} />
          </button>
        ) : null}
      </div>

      <div className="card-body">
        <div className="card-topline">
          <span className="card-address">
            <MapPin size={13} />
            {item.address}
          </span>
        </div>

        <Tags item={item} />

        {item.author_name ? <p className="card-author">{item.author_name}</p> : null}
        {item.description ? <p className="card-description">{item.description}</p> : null}

        <div className="card-actions">
          <button
            type="button"
            className={`reaction ${item.my_reaction === 'like' ? 'active like' : ''}`}
            onClick={() => onReact('like')}
            aria-label="Нравится"
          >
            <ThumbsUp size={16} />
            {item.likes}
          </button>
          <button
            type="button"
            className={`reaction ${item.my_reaction === 'dislike' ? 'active dislike' : ''}`}
            onClick={() => onReact('dislike')}
            aria-label="Не нравится"
          >
            <ThumbsDown size={16} />
            {item.dislikes}
          </button>
          <Link to={`/g/${item.id}`} className="reaction place-comments-link">
            <MessageCircle size={16} />
            {item.comments_count}
          </Link>
          <Link to={`/map?place=${item.id}`} className="reaction comments-link">
            <MapIcon size={16} />
            На карте
          </Link>
        </div>

        <div className="card-report-row">
          <ReportButton targetType="place" targetId={`stena-${item.id}`} title={item.address} className="card-report-link" />
        </div>
      </div>
    </article>
  );
}
