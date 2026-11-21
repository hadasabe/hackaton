import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { WALL_TERMS_META } from '../lib/constants';
import type { Wall } from '../lib/types';
import { formatDate } from '../lib/format';

export function AccountPage() {
  const location = useLocation();
  const [walls, setWalls] = useState<Wall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.myWalls();
      setWalls(data.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить кабинет');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="page account-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Личный кабинет</span>
          <h1>Мои стены</h1>
          <p>Стены, которые вы выложили. Контакт для связи видят художники в карточке.</p>
        </div>
        <Link to="/walls/new" className="button button-dark">
          <Plus size={16} /> Выложить стену
        </Link>
      </header>

      {location.state?.wallSubmitted ? (
        <div className="notice">
          Стена отправлена на модерацию. Она появится в каталоге после проверки администратора.
        </div>
      ) : null}

      {error ? <div className="notice error">{error}</div> : null}

      {loading ? (
        <div className="account-list">
          {Array.from({ length: 3 }).map((_, index) => <div className="admin-skeleton" key={index} />)}
        </div>
      ) : walls.length === 0 ? (
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
      )}
    </main>
  );
}
