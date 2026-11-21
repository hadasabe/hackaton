import { useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Reply, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import type { Comment, ReactionValue } from '../lib/types';
import { formatDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from './ConfirmDialog';
import { CommentAvatar } from './CommentAvatar';

interface CommentNode extends Comment {
  replies: CommentNode[];
}

function buildTree(comments: Comment[]): CommentNode[] {
  const nodes = comments.map((comment) => ({ ...comment, replies: [] as CommentNode[] }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots: CommentNode[] = [];
  for (const node of nodes) {
    if (node.parent_id && byId.has(node.parent_id)) byId.get(node.parent_id)!.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

export function CommentThread({
  comments,
  onReact,
  onReply,
  onDelete,
  emptyText = 'Пока нет комментариев.',
}: {
  comments: Comment[];
  onReact: (comment: Comment, value: ReactionValue) => Promise<void> | void;
  onReply: (comment: Comment, body: string) => Promise<void> | void;
  onDelete: (comment: Comment) => Promise<void> | void;
  emptyText?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  function requireLogin() {
    navigate('/login', { state: { from: location.pathname } });
  }

  async function react(comment: Comment, value: ReactionValue) {
    if (!user) {
      requireLogin();
      return;
    }
    await onReact(comment, value);
  }

  async function submitReply(event: FormEvent, comment: Comment) {
    event.preventDefault();
    if (!user) {
      requireLogin();
      return;
    }
    if (!replyBody.trim()) return;
    setSending(true);
    try {
      await onReply(comment, replyBody.trim());
      setReplyBody('');
      setReplyTo(null);
    } finally {
      setSending(false);
    }
  }

  async function remove(comment: Comment) {
    const confirmed = await confirm({
      title: 'Удалить комментарий?',
      message: 'Комментарий будет удалён, ответы на него останутся.',
      confirmLabel: 'Удалить',
      skipKey: 'delete-comment',
    });
    if (confirmed) await onDelete(comment);
  }

  function renderComment(comment: CommentNode): ReactNode {
    const deleted = Boolean(comment.deleted);
    return (
      <article className={`comment${deleted ? ' deleted' : ''}`} key={comment.id}>
        <div className="comment-head">
          <CommentAvatar name={comment.author_name} avatarUrl={comment.avatar_url} />
          <strong>{comment.author_name}</strong>
          <span>{formatDate(comment.created_at)}</span>
          {comment.reply_to_name ? <span className="comment-reply-to">в ответ {comment.reply_to_name}</span> : null}
          {comment.can_delete && !deleted ? (
            <button
              type="button"
              className="icon-button comment-delete"
              onClick={() => void remove(comment)}
              aria-label="Удалить комментарий"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>

        {deleted ? <p className="comment-deleted">Комментарий удалён</p> : <p>{comment.body}</p>}

        {!deleted ? (
          <div className="comment-actions">
            <button
              type="button"
              className={`comment-reaction ${comment.my_reaction === 'like' ? 'active' : ''}`}
              onClick={() => void react(comment, 'like')}
              aria-label="Нравится комментарий"
            >
              <ThumbsUp size={13} /> {comment.likes}
            </button>
            <button
              type="button"
              className={`comment-reaction ${comment.my_reaction === 'dislike' ? 'active' : ''}`}
              onClick={() => void react(comment, 'dislike')}
              aria-label="Не нравится комментарий"
            >
              <ThumbsDown size={13} /> {comment.dislikes}
            </button>
            <button
              type="button"
              className="comment-reply-button"
              onClick={() => {
                if (!user) {
                  requireLogin();
                  return;
                }
                setReplyTo(comment.id);
                setReplyBody('');
              }}
            >
              <Reply size={13} /> Ответить
            </button>
          </div>
        ) : null}

        {!deleted && replyTo === comment.id ? (
          <form className="comment-reply-form" onSubmit={(event) => void submitReply(event, comment)}>
            <textarea
              className="textarea"
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              placeholder={`Ответ ${comment.author_name}`}
              maxLength={1000}
              rows={2}
              autoFocus
            />
            <div className="comment-reply-actions">
              <button type="button" className="text-button" onClick={() => setReplyTo(null)}>
                Отмена
              </button>
              <button type="submit" className="button button-dark" disabled={sending || !replyBody.trim()}>
                {sending ? 'Отправляем…' : 'Ответить'}
              </button>
            </div>
          </form>
        ) : null}

        {comment.replies.length > 0 ? (
          <>
            <button
              type="button"
              className="comment-replies-toggle"
              onClick={() => {
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(comment.id)) next.delete(comment.id);
                  else next.add(comment.id);
                  return next;
                });
              }}
            >
              {collapsed.has(comment.id) ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              {collapsed.has(comment.id)
                ? `Показать ответы (${comment.replies.length})`
                : 'Скрыть ответы'}
            </button>
            {collapsed.has(comment.id) ? null : (
              <div className="comment-replies">
                {comment.replies.map((reply) => renderComment(reply))}
              </div>
            )}
          </>
        ) : null}
      </article>
    );
  }

  if (!comments.length) return <p className="muted">{emptyText}</p>;

  return <div className="comment-list">{buildTree(comments).map((comment) => renderComment(comment))}</div>;
}
