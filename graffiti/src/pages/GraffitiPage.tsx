import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FolderPlus,
  Heart,
  HeartOff,
  MapPin,
  Reply,
  Send,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { STATUS_META, STATUS_OPTIONS } from '../lib/constants';
import type { Comment, Graffiti, ReactionValue, Status } from '../lib/types';

import { formatDate, timeAgo } from '../lib/format';
import { Tags } from '../components/GraffitiCard';
import { CommentThread } from '../components/CommentThread';
import { CommentAvatar } from '../components/CommentAvatar';
import { CollectionPickerDialog } from '../components/CollectionPickerDialog';
import { useConfirm } from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { NotFoundPage } from './NotFoundPage';
import { BackLink } from '../components/BackLink';

export function GraffitiPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const numericId = Number(id);
  const [item, setItem] = useState<Graffiti | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [sending, setSending] = useState(false);
  const [reportStatus, setReportStatus] = useState<Status>('alive');
  const [reportComment, setReportComment] = useState('');
  const [reportSending, setReportSending] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [reportError, setReportError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState('');

  useEffect(() => {
    if (!Number.isInteger(numericId)) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .graffiti(numericId)
      .then((data) => {
        setItem(data.item);
        setComments(data.comments);
        setReportStatus(data.item.status);
        setNotFound(false);
      })
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 404) setNotFound(true);
        else setError(caught instanceof Error ? caught.message : 'Не удалось загрузить работу');
      })
      .finally(() => setLoading(false));
  }, [numericId]);

  async function handleReact(value: ReactionValue) {
    if (!user) {
      navigate('/login', { state: { from: `/g/${numericId}` } });
      return;
    }
    if (!item) return;
    const previous = item;
    let likes = item.likes;
    let dislikes = item.dislikes;
    let myReaction = item.my_reaction;
    if (myReaction === value) {
      if (value === 'like') likes -= 1;
      else dislikes -= 1;
      myReaction = null;
    } else {
      if (myReaction === 'like') likes -= 1;
      if (myReaction === 'dislike') dislikes -= 1;
      if (value === 'like') likes += 1;
      else dislikes += 1;
      myReaction = value;
    }
    setItem({ ...item, likes, dislikes, my_reaction: myReaction });
    try {
      const result = await api.react(item.id, value);
      setItem((current) => (current ? { ...current, ...result } : current));
    } catch {
      setItem(previous);
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!item || !commentBody.trim()) return;
    setSending(true);
    setError('');
    try {
      const comment = await api.addComment(item.id, commentBody.trim());
      setComments((current) => [...current, comment]);
      setCommentBody('');
      setItem((current) =>
        current ? { ...current, comments_count: current.comments_count + 1 } : current,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить комментарий');
    } finally {
      setSending(false);
    }
  }

  async function replyComment(parent: Comment, body: string) {
    if (!item) return;
    setError('');
    try {
      const comment = await api.addComment(item.id, body, parent.id);
      setComments((current) => [...current, comment]);
      setItem((current) =>
        current ? { ...current, comments_count: current.comments_count + 1 } : current,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить ответ');
      throw caught;
    }
  }

  async function reactComment(comment: Comment, value: ReactionValue) {
    if (!user) {
      navigate('/login', { state: { from: `/g/${numericId}` } });
      return;
    }
    let likes = comment.likes;
    let dislikes = comment.dislikes;
    let myReaction = comment.my_reaction;
    if (myReaction === 'like') likes -= 1;
    if (myReaction === 'dislike') dislikes -= 1;
    if (myReaction === value) myReaction = null;
    else {
      if (value === 'like') likes += 1;
      else dislikes += 1;
      myReaction = value;
    }
    setComments((current) =>
      current.map((item) => (item.id === comment.id ? { ...item, likes, dislikes, my_reaction: myReaction } : item)),
    );
    try {
      const result = await api.reactComment(comment.id, value);
      setComments((current) =>
        current.map((item) => (item.id === comment.id ? { ...item, ...result } : item)),
      );
    } catch {
      setComments((current) => current.map((item) => (item.id === comment.id ? comment : item)));
    }
  }

  async function toggleFavorite() {
    if (!user) {
      navigate('/login', { state: { from: `/g/${numericId}` } });
      return;
    }
    if (!item) return;
    const next = !item.favorite;
    setItem({ ...item, favorite: next });
    try {
      const result = await api.toggleGraffitiFavorite(item.id);
      setItem((current) => current ? { ...current, favorite: result.favorite } : current);
    } catch (caught) {
      setItem(item);
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить работу');
    }
  }

  async function shareGraffiti() {
    const url = `${window.location.origin}/#/g/${numericId}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('Ссылка скопирована');
    } catch {
      setShareStatus(url);
    }
    window.setTimeout(() => setShareStatus(''), 5000);
  }

  async function removeComment(commentId: number) {
    const confirmed = await confirm({
      title: 'Удалить комментарий?',
      message: 'Комментарий исчезнет для всех. Действие необратимо.',
      confirmLabel: 'Удалить',
      skipKey: 'delete-comment',
    });
    if (!confirmed) return;
    try {
      await api.deleteComment(commentId);
      setComments((current) => {
        const hasReplies = current.some((comment) => comment.parent_id === commentId);
        if (!hasReplies) return current.filter((comment) => comment.id !== commentId);
        return current.map((comment) => comment.id === commentId
          ? {
            ...comment,
            deleted: true,
            body: '',
            author_name: 'Комментарий удалён',
            can_delete: false,
            likes: 0,
            dislikes: 0,
            my_reaction: null,
          }
          : comment);
      });
      setItem((current) =>
        current ? { ...current, comments_count: Math.max(0, current.comments_count - 1) } : current,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить комментарий');
    }
  }

  async function submitStatusReport() {
    if (!item || !user) return;
    setReportSending(true);
    setReportError('');
    try {
      await api.reportStatus(item.id, reportStatus, reportComment.trim());
      setReportDone(true);
      setReportComment('');
    } catch (caught) {
      setReportError(caught instanceof Error ? caught.message : 'Не удалось отправить заявку');
    } finally {
      setReportSending(false);
    }
  }

  if (notFound) return <NotFoundPage />;

  if (loading) {
    return (
      <main className="page">
        <div className="detail-skeleton" />
      </main>
    );
  }

  if (!item) {
    return (
      <main className="page page-narrow">
        <div className="notice error">{error || 'Работа не найдена'}</div>
        <Link to="/" className="button button-outline"><ArrowLeft size={16} /> К ленте</Link>
      </main>
    );
  }


  return (
    <main className="page detail-page">
      <BackLink />

      <div className="detail-layout">
        <div className="detail-image">
          <img src={item.image_path} alt={`Граффити: ${item.address}`} />
        </div>

        <div className="detail-info">
          <div className="detail-head">
            <div>
              <span className="section-kicker">Работа #{item.id}</span>
              <h1>{item.address}</h1>
            </div>
            <Tags item={item} />
          </div>

          <div className="detail-meta">
            <span><MapPin size={15} /> {item.address}</span>
            <span><Clock3 size={15} /> {formatDate(item.published_at || item.created_at)}</span>
            {item.author_name ? <span>Автор: <strong>{item.author_name}</strong></span> : null}
          </div>

          {item.description ? <p className="detail-description">{item.description}</p> : null}

          <div className="detail-actions">
            <button
              type="button"
              className={`reaction big ${item.my_reaction === 'like' ? 'active like' : ''}`}
              onClick={() => void handleReact('like')}
              aria-label="Нравится"
            >
              <ThumbsUp size={18} /> {item.likes}
            </button>
            <button
              type="button"
              className={`reaction big ${item.my_reaction === 'dislike' ? 'active dislike' : ''}`}
              onClick={() => void handleReact('dislike')}
              aria-label="Не нравится"
            >
              <ThumbsDown size={18} /> {item.dislikes}
            </button>
            <button
              type="button"
              className={`button ${item.favorite ? 'button-dark' : 'button-outline'}`}
              onClick={() => void toggleFavorite()}
              aria-label={item.favorite ? 'Убрать из избранного' : 'В избранное'}
              title={item.favorite ? 'Убрать из избранного' : 'В избранное'}
            >
              {item.favorite ? <HeartOff size={17} /> : <Heart size={17} />}
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() => void shareGraffiti()}
              aria-label="Поделиться"
              title="Поделиться"
            >
              <Share2 size={17} />
            </button>
            {user ? (
              <button
                type="button"
                className="button button-outline detail-collection"
                onClick={() => setPickerOpen(true)}
                aria-label="В коллекцию"
                title="В коллекцию"
              >
                <FolderPlus size={17} />
              </button>
            ) : null}
          </div>
          {shareStatus ? <p className="share-status">{shareStatus}</p> : null}

          <section className="status-report-box">
            <div className="status-report-head">
              <div>
                <span className="section-kicker">Статус работы</span>
                <h2>Что с работой сейчас?</h2>
              </div>
              <span
                className="tag"
                style={{
                  color: STATUS_META[item.status].color,
                  background: STATUS_META[item.status].background,
                }}
              >
                {STATUS_META[item.status].label}
              </span>
            </div>
            <p className="muted small">
              Если граффити закрасили, оно осыпалось или, наоборот, всё ещё на месте —
              сообщите. Администратор проверит и обновит статус.
            </p>

            {!user ? (
              <div className="auth-inline">
                <p>Войдите, чтобы сообщить об изменении статуса.</p>
                <div className="row gap-10 wrap">
                  <Link to="/login" state={{ from: `/g/${numericId}` }} className="button button-dark">
                    Войти
                  </Link>
                  <Link to="/register" state={{ from: `/g/${numericId}` }} className="button button-outline">
                    Регистрация
                  </Link>
                </div>
              </div>
            ) : reportDone ? (
              <div className="status-report-done">
                <CheckCircle2 size={20} />
                <div>
                  <strong>Спасибо, заявка на проверке</strong>
                  <span>Администратор обновит статус после подтверждения.</span>
                </div>
              </div>
            ) : (
              <div className="status-report-form">
                <div className="status-choice">
                  {STATUS_OPTIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`chip ${reportStatus === value ? 'active' : ''}`}
                      onClick={() => setReportStatus(value)}
                    >
                      {STATUS_META[value].label}
                    </button>
                  ))}
                </div>
                <textarea
                  className="textarea"
                  rows={2}
                  value={reportComment}
                  onChange={(event) => setReportComment(event.target.value)}
                  placeholder="Комментарий для администратора: что изменилось?"
                  maxLength={400}
                />
                {reportError ? <div className="notice error">{reportError}</div> : null}
                <button
                  type="button"
                  className="button button-dark"
                  onClick={() => void submitStatusReport()}
                  disabled={reportSending}
                >
                  {reportSending ? 'Отправляем…' : 'Отправить на проверку'}
                </button>
              </div>
            )}
          </section>

          <section className="comments">
            <h2>Комментарии</h2>
            {error ? <div className="notice error">{error}</div> : null}

            <CommentThread
              comments={comments}
              onReact={(comment, value) => void reactComment(comment, value)}
              onReply={(comment, body) => void replyComment(comment, body)}
              onDelete={(comment) => void removeComment(comment.id)}
              emptyText="Пока никто не оставил комментарий. Будьте первым."
            />

            {user ? (
              <form className="comment-form" onSubmit={(event) => void submitComment(event)}>
                <p className="comment-as">Комментарий от <strong>{user.name}</strong></p>
                <textarea
                  className="textarea"
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Что думаете об этой работе?"
                  maxLength={1000}
                  rows={3}
                />
                <button
                  type="submit"
                  className="button button-dark"
                  disabled={sending || !commentBody.trim()}
                >
                  <Send size={15} /> {sending ? 'Отправляем…' : 'Отправить'}
                </button>
              </form>
            ) : (
              <div className="auth-inline">
                <p>Войдите, чтобы оставить комментарий.</p>
                <div className="row gap-10 wrap">
                  <Link to="/login" state={{ from: `/g/${numericId}` }} className="button button-dark">
                    Войти
                  </Link>
                  <Link to="/register" state={{ from: `/g/${numericId}` }} className="button button-outline">
                    Регистрация
                  </Link>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {pickerOpen ? (
        <CollectionPickerDialog graffitiId={item.id} onClose={() => setPickerOpen(false)} />
      ) : null}
    </main>
  );
}
