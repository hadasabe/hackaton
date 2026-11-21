export function CommentAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  return (
    <span className="comment-avatar" aria-hidden="true">
      {avatarUrl ? <img src={avatarUrl} alt="" /> : (name || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}
