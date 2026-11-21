import { useState, type FormEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Flag, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const REASONS = ['Спам', 'Оскорбления', 'Недостоверная информация', 'Нарушение правил'];

export type ReportTargetType = 'comment' | 'route_comment' | 'graffiti_comment' | 'place_comment' | 'place' | 'building' | 'route' | 'wall' | 'collection';

export function ReportButton({
  targetType,
  targetId,
  title,
  className = 'report-link',
}: {
  targetType: ReportTargetType;
  targetId: string | number;
  title?: string;
  className?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  function openDialog(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!user) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    setOpen(true);
    setSent(false);
    setError('');
    setReason(REASONS[0]);
    setDetails('');
  }

  function closeDialog() {
    setOpen(false);
    setSending(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason) return;
    setSending(true);
    setError('');
    try {
      await api.reportContent({
        target_type: targetType,
        target_id: String(targetId),
        reason,
        details: details.trim(),
      });
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить жалобу');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={openDialog}>
        <Flag size={12} /> Пожаловаться
      </button>
      {open ? createPortal(
        <div
          className="modal-backdrop report-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <form
            className="modal-card report-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            onSubmit={(event) => void submit(event)}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="section-kicker">Жалоба</span>
                <h2 id="report-title">Пожаловаться</h2>
                {title ? <p className="report-target">{title}</p> : null}
              </div>
              <button type="button" className="icon-button" onClick={closeDialog} aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>

            {sent ? (
              <div className="report-sent">
                <CheckCircle2 size={24} />
                <div>
                  <strong>Жалоба отправлена</strong>
                  <span>Администратор проверит материал.</span>
                </div>
              </div>
            ) : (
              <>
                <p className="report-dialog-copy">Выберите причину:</p>
                <div className="report-reasons">
                  {REASONS.map((value) => (
                    <label className={`report-reason-option${reason === value ? ' active' : ''}`} key={value}>
                      <input
                        type="radio"
                        name="report-reason"
                        value={value}
                        checked={reason === value}
                        onChange={() => setReason(value)}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
                <label className="report-details">
                  Комментарий
                  <textarea
                    className="textarea"
                    value={details}
                    onChange={(event) => setDetails(event.target.value)}
                    placeholder="Что не так с материалом? Необязательно"
                    maxLength={800}
                    rows={3}
                  />
                </label>
                {error ? <div className="notice error">{error}</div> : null}
              </>
            )}

            <div className="modal-actions">
              {sent ? (
                <button type="button" className="button button-dark" onClick={closeDialog}>Закрыть</button>
              ) : (
                <>
                  <button type="button" className="button button-outline" onClick={closeDialog}>Отмена</button>
                  <button type="submit" className="button button-dark" disabled={sending || !reason}>
                    {sending ? 'Отправляем…' : 'Отправить жалобу'}
                  </button>
                </>
              )}
            </div>
          </form>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
