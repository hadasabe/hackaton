import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';

export function CollectionFormDialog({
  mode,
  initialTitle = '',
  initialDescription = '',
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initialTitle?: string;
  initialDescription?: string;
  onClose: () => void;
  onSubmit: (payload: { title: string; description: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 2) return;
    setSaving(true);
    setError('');
    try {
      await onSubmit({ title: title.trim(), description: description.trim() });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить коллекцию');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Коллекция">
      <form className="modal-card" onSubmit={(event) => void submit(event)}>
        <div className="modal-head">
          <div>
            <span className="section-kicker">Подборки</span>
            <h2>{mode === 'create' ? 'Новая коллекция' : 'Редактировать коллекцию'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        {error ? <div className="notice error">{error}</div> : null}
        <label className="field">
          <span>Название</span>
          <input
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Например, «Улыбки Саратова»"
            maxLength={80}
            autoFocus
            required
          />
        </label>
        <label className="field">
          <span>Описание <em>необязательно</em></span>
          <textarea
            className="textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Что объединяет работы в этой подборке"
            maxLength={400}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Отмена</button>
          <button type="submit" className="button button-dark" disabled={saving || title.trim().length < 2}>
            {saving ? 'Сохраняем…' : mode === 'create' ? 'Создать' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}
