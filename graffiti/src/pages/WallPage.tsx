import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AtSign, MapPin, Ruler, Trash2, UserRound } from 'lucide-react';
import { api } from '../lib/api';
import { WALL_TERMS_META, WALL_TYPE_META } from '../lib/constants';
import type { Wall } from '../lib/types';
import { useConfirm } from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { NotFoundPage } from './NotFoundPage';

function contactHref(contact: string) {
  const value = contact.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^@[\w.]+$/.test(value)) return `https://t.me/${value.slice(1)}`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  if (/^[+\d][\d\s()-]{6,}$/.test(value)) return `tel:${value.replace(/[^\d+]/g, '')}`;
  return null;
}

export function WallPage() {
  const { id } = useParams();
  const numericId = Number(id);
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [wall, setWall] = useState<Wall | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!Number.isInteger(numericId)) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.wall(numericId);
      setWall(data.wall);
      setNotFound(false);
    } catch (caught) {
      setNotFound(true);
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить стену');
    } finally {
      setLoading(false);
    }
  }, [numericId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(status: 'open' | 'closed') {
    if (!wall) return;
    try {
      await api.updateWall(wall.id, status);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось изменить статус');
    }
  }

  async function removeWall() {
    if (!wall) return;
    const confirmed = await confirm({
      title: 'Удалить стену?',
      message: 'Объявление и фото исчезнут без возможности восстановления.',
      confirmLabel: 'Удалить',
      skipKey: 'delete-wall',
    });
    if (!confirmed) return;
    try {
      await api.deleteWall(wall.id);
      navigate('/walls');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить стену');
    }
  }

  if (notFound) return <NotFoundPage />;
  if (loading) {
    return <main className="page"><div className="detail-skeleton" /></main>;
  }
  if (!wall) {
    return <main className="page page-narrow"><div className="notice error">{error}</div></main>;
  }

  const terms = WALL_TERMS_META[wall.terms];
  const canManage = user?.id === wall.owner_id || user?.role === 'admin';
  const href = contactHref(wall.contact || '');

  return (
    <main className="page wall-page">
      <Link to="/walls" className="back-link"><ArrowLeft size={16} /> К стенам</Link>

      {wall.moderation_status === 'pending' ? (
        <div className="notice">
          Стена на проверке. В каталоге она появится после одобрения редакции.
        </div>
      ) : null}

      <div className="wall-detail-layout">
        <div className="wall-detail-image">
          <img src={wall.image_path} alt={`Стена: ${wall.address}`} />
        </div>
        <div className="wall-detail-info">
          <div className="wall-detail-top">
            <span className="wall-terms" style={{ color: terms.color, background: terms.background }}>
              {terms.label}
            </span>
            <span className={`moderation-badge ${wall.moderation_status}`}>
              {wall.moderation_status === 'pending'
                ? 'На проверке'
                : wall.moderation_status === 'published'
                  ? 'Опубликована'
                  : 'Отклонена'}
            </span>
          </div>
          <h1>{wall.title}</h1>
          <div className="wall-detail-meta">
            <span><MapPin size={15} /> {wall.address}</span>
            <span><Ruler size={15} /> {WALL_TYPE_META[wall.type].label}{wall.size ? ` · ${wall.size}` : ''}</span>
            <span><UserRound size={15} /> {wall.owner_name}</span>
          </div>
          <p className="wall-detail-description">{wall.description}</p>
          {wall.price_note ? <p className="wall-price-note">{wall.price_note}</p> : null}
          {wall.moderation_status === 'rejected' && wall.reject_reason ? (
            <p className="reject-reason">Причина отклонения: {wall.reject_reason}</p>
          ) : null}

          <div className="wall-contact-block">
            <span className="section-kicker"><AtSign size={14} /> Контакт владельца</span>
            {wall.contact ? (
              href ? (
                <a className="wall-contact-value" href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                  {wall.contact}
                </a>
              ) : (
                <p className="wall-contact-value">{wall.contact}</p>
              )
            ) : (
              <p className="muted">Владелец не указал контакт.</p>
            )}
            <p className="muted small">Напишите или позвоните напрямую по этому контакту.</p>
          </div>

          {canManage ? (
            <div className="wall-manage">
              {wall.moderation_status === 'published' ? (
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => void updateStatus(wall.status === 'open' ? 'closed' : 'open')}
                >
                  {wall.status === 'open' ? 'Закрыть стену' : 'Открыть снова'}
                </button>
              ) : null}
              <button type="button" className="button button-danger" onClick={() => void removeWall()}>
                <Trash2 size={15} /> Удалить
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
