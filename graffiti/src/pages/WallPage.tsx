import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Ruler,
  Send,
  Trash2,
  UserRound,
} from 'lucide-react';
import { api } from '../lib/api';
import { WALL_TERMS_META, WALL_TYPE_META } from '../lib/constants';
import type { Wall, WallInquiry, WallMessage } from '../lib/types';
import { formatDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { NotFoundPage } from './NotFoundPage';

export function WallPage() {
  const { id } = useParams();
  const numericId = Number(id);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [wall, setWall] = useState<Wall | null>(null);
  const [inquiries, setInquiries] = useState<WallInquiry[]>([]);
  const [myInquiry, setMyInquiry] = useState<WallInquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

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
      setInquiries(data.inquiries);
      setMyInquiry(data.myInquiry);
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

  async function contactOwner() {
    if (!wall || !message.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.contactWall(wall.id, message.trim());
      setMessage('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  }

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
    if (!wall || !window.confirm('Удалить стену? Диалоги тоже удалятся.')) return;
    try {
      await api.deleteWall(wall.id);
      navigate('/walls');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить стену');
    }
  }

  async function sendMessage(inquiryId: number, body: string) {
    await api.sendInquiryMessage(inquiryId, body);
    await load();
  }

  if (notFound) return <NotFoundPage />;
  if (loading) {
    return <main className="page"><div className="detail-skeleton" /></main>;
  }
  if (!wall) {
    return <main className="page page-narrow"><div className="notice error">{error}</div></main>;
  }

  const terms = WALL_TERMS_META[wall.terms];
  const owner = user?.id === wall.owner_id;
  const canManage = owner || user?.role === 'admin';

  return (
    <main className="page wall-page">
      <Link to="/walls" className="back-link"><ArrowLeft size={16} /> К стенам</Link>

      <div className="wall-detail-layout">
        <div className="wall-detail-image">
          <img src={wall.image_path} alt={`Стена: ${wall.address}`} />
        </div>
        <div className="wall-detail-info">
          <div className="wall-detail-top">
            <span className="wall-terms" style={{ color: terms.color, background: terms.background }}>
              {terms.label}
            </span>
            <span className={`moderation-badge ${wall.status === 'open' ? 'published' : 'rejected'}`}>
              {wall.status === 'open' ? 'Открыта для заявок' : 'Закрыта'}
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

          {canManage ? (
            <div className="wall-manage">
              <button
                type="button"
                className="button button-outline"
                onClick={() => void updateStatus(wall.status === 'open' ? 'closed' : 'open')}
              >
                {wall.status === 'open' ? 'Закрыть стену' : 'Открыть снова'}
              </button>
              <button type="button" className="button button-danger" onClick={() => void removeWall()}>
                <Trash2 size={15} /> Удалить
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {owner ? (
        <section className="wall-messages">
          <div className="wall-section-head">
            <div>
              <span className="section-kicker">Заявки художников</span>
              <h2>Кто хочет рисовать</h2>
            </div>
            <span className="badge">{inquiries.length} диалогов</span>
          </div>
          {inquiries.length === 0 ? (
            <p className="muted">Пока никто не написал. Когда художник откликнется, диалог появится здесь.</p>
          ) : (
            <div className="thread-list">
              {inquiries.map((inquiry) => (
                <ThreadBox
                  key={inquiry.id}
                  title={inquiry.artist_name || 'Художник'}
                  subtitle={formatDate(inquiry.created_at)}
                  messages={inquiry.messages || []}
                  currentUserId={user?.id}
                  onSend={(body) => sendMessage(inquiry.id, body)}
                />
              ))}
            </div>
          )}
        </section>
      ) : !user ? (
        <section className="wall-contact">
          <LockKeyhole size={24} />
          <h2>Хотите нарисовать здесь?</h2>
          <p>Войдите или зарегистрируйтесь, чтобы написать владельцу. Контакты не публикуются.</p>
          <div className="row gap-10 wrap">
            <Link to="/login" state={{ from: `/walls/${wall.id}` }} className="button button-dark">Войти</Link>
            <Link to="/register" state={{ from: `/walls/${wall.id}` }} className="button button-outline">
              Регистрация
            </Link>
          </div>
        </section>
      ) : (
        <section className="wall-messages">
          <div className="wall-section-head">
            <div>
              <span className="section-kicker">Связаться с владельцем</span>
              <h2>Написать о работе</h2>
            </div>
          </div>
          {myInquiry ? (
            <ThreadBox
              title="Диалог с владельцем"
              subtitle={`${wall.owner_name} · ${formatDate(myInquiry.created_at)}`}
              messages={myInquiry.messages || []}
              currentUserId={user.id}
              onSend={(body) => sendMessage(myInquiry.id, body)}
            />
          ) : wall.status !== 'open' ? (
            <p className="muted">Стена сейчас закрыта для новых заявок.</p>
          ) : (
            <div className="wall-contact-form">
              <p className="muted small">
                Напишите, что хотите нарисовать, какие нужны материалы и когда удобно.
                Владелец ответит в этом диалоге.
              </p>
              <textarea
                className="textarea"
                rows={4}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Здравствуйте! Хочу сделать мурал на этой стене…"
                maxLength={1200}
              />
              {error ? <div className="notice error">{error}</div> : null}
              <button
                type="button"
                className="button button-dark"
                disabled={sending || !message.trim()}
                onClick={() => void contactOwner()}
              >
                <Send size={15} /> {sending ? 'Отправляем…' : 'Отправить владельцу'}
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function ThreadBox({
  title,
  subtitle,
  messages,
  currentUserId,
  onSend,
}: {
  title: string;
  subtitle: string;
  messages: WallMessage[];
  currentUserId?: number;
  onSend: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError('');
    try {
      await onSend(body.trim());
      setBody('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  }

  return (
    <article className="thread">
      <div className="thread-head">
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <MessageCircle size={17} />
      </div>
      <div className="thread-messages">
        {messages.length === 0 ? (
          <p className="muted small">Пока нет сообщений.</p>
        ) : (
          messages.map((item) => (
            <div className={`thread-message ${item.sender_id === currentUserId ? 'mine' : ''}`} key={item.id}>
              <div className="thread-message-head">
                <strong>{item.sender_name}</strong>
                <span>{formatDate(item.created_at)}</span>
              </div>
              <p>{item.body}</p>
            </div>
          ))
        )}
      </div>
      <form className="thread-form" onSubmit={(event) => void submit(event)}>
        <input
          className="input"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Написать сообщение…"
          maxLength={1200}
        />
        <button type="submit" className="button button-dark" disabled={sending || !body.trim()}>
          {sending ? '…' : <Send size={15} />}
        </button>
      </form>
      {error ? <div className="notice error">{error}</div> : null}
    </article>
  );
}
