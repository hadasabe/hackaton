import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { WALL_TERMS_META } from '../lib/constants';
import type { Wall, WallInquiry } from '../lib/types';
import { formatDate } from '../lib/format';

export function AccountPage() {
  const [tab, setTab] = useState<'walls' | 'inquiries'>('walls');
  const [walls, setWalls] = useState<Wall[]>([]);
  const [inquiries, setInquiries] = useState<WallInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [wallsData, inquiriesData] = await Promise.all([api.myWalls(), api.myInquiries()]);
      setWalls(wallsData.items);
      setInquiries(inquiriesData.items);
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
          <h1>Мои стены и заявки</h1>
          <p>Стены, которые вы выложили, и диалоги с художниками.</p>
        </div>
        <Link to="/walls/new" className="button button-dark">
          <Plus size={16} /> Выложить стену
        </Link>
      </header>

      <div className="account-tabs">
        <button
          type="button"
          className={`chip ${tab === 'walls' ? 'active' : ''}`}
          onClick={() => setTab('walls')}
        >
          Мои стены <span>{walls.length}</span>
        </button>
        <button
          type="button"
          className={`chip ${tab === 'inquiries' ? 'active' : ''}`}
          onClick={() => setTab('inquiries')}
        >
          Мои заявки <span>{inquiries.length}</span>
        </button>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {loading ? (
        <div className="account-list">
          {Array.from({ length: 3 }).map((_, index) => <div className="admin-skeleton" key={index} />)}
        </div>
      ) : tab === 'walls' ? (
        walls.length === 0 ? (
          <div className="empty-feed">
            <h3>Вы ещё не выкладывали стены</h3>
            <p>Добавьте свободный фасад, гараж или забор — художники найдут вас.</p>
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
                      <span className={`tag ${wall.status === 'open' ? 'tag-status' : ''}`}
                        style={wall.status === 'open' ? { color: '#0b6b3a', background: '#c8ffd9' } : undefined}
                      >
                        {wall.status === 'open' ? 'открыта' : 'закрыта'}
                      </span>
                      <span className="tag" style={{ color: terms.color, background: terms.background }}>{terms.label}</span>
                    </div>
                    <span>{wall.address}</span>
                    <small>{wall.inquiries_count ?? 0} заявок · {formatDate(wall.created_at)}</small>
                  </div>
                  <ArrowRight size={18} />
                </Link>
              );
            })}
          </div>
        )
      ) : inquiries.length === 0 ? (
        <div className="empty-feed">
          <h3>Заявок пока нет</h3>
          <p>Найдите стену в каталоге и напишите владельцу.</p>
          <Link to="/walls" className="button button-dark">Смотреть стены</Link>
        </div>
      ) : (
        <div className="account-list">
          {inquiries.map((inquiry) => (
            <Link to={`/walls/${inquiry.wall_id}`} className="account-row" key={inquiry.id}>
              {inquiry.image_path ? <img src={inquiry.image_path} alt={inquiry.address || ''} /> : null}
              <div className="account-row-main">
                <strong>{inquiry.title || 'Стена'}</strong>
                <span>{inquiry.address} · владелец: {inquiry.owner_name}</span>
                <small>
                  <MessageCircle size={13} /> {inquiry.last_message || 'Сообщений пока нет'}
                </small>
              </div>
              <ArrowRight size={18} />
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
