import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { api } from '../lib/api';
import type { CollectionSummary } from '../lib/types';

export function CollectionPickerDialog({
  graffitiId,
  onClose,
}: {
  graffitiId: number;
  onClose: () => void;
}) {
  const [items, setItems] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.myCollections(graffitiId);
      setItems(data.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить коллекции');
    } finally {
      setLoading(false);
    }
  }, [graffitiId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(collection: CollectionSummary) {
    setBusyId(collection.id);
    setError('');
    try {
      if (collection.contains) await api.removeFromCollection(collection.id, graffitiId);
      else await api.addToCollection(collection.id, graffitiId);
      setItems((current) =>
        current.map((item) =>
          item.id === collection.id
            ? {
                ...item,
                contains: !item.contains,
                item_count: Math.max(0, item.item_count + (item.contains ? -1 : 1)),
              }
            : item,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось изменить коллекцию');
    } finally {
      setBusyId(null);
    }
  }

  async function createAndAdd(event: FormEvent) {
    event.preventDefault();
    const title = newTitle.trim();
    if (title.length < 2) return;
    setCreating(true);
    setError('');
    try {
      const { collection } = await api.createCollection({ title, description: '' });
      await api.addToCollection(collection.id, graffitiId);
      setItems((current) => [{ ...collection, contains: true, item_count: 1 }, ...current]);
      setNewTitle('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать коллекцию');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Добавить в коллекцию">
      <div className="modal-card collection-picker">
        <div className="modal-head">
          <div>
            <span className="section-kicker">Подборки</span>
            <h2>Добавить в коллекцию</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <p className="muted small">
          Соберите работы по теме — например, все улыбки, портреты или надписи.
        </p>
        {error ? <div className="notice error">{error}</div> : null}
        {loading ? (
          <div className="collection-picker-loading">Загружаем коллекции…</div>
        ) : items.length === 0 ? (
          <div className="collection-picker-empty">
            <strong>У вас пока нет коллекций</strong>
            <span>Создайте первую прямо здесь — работа сразу попадёт в неё.</span>
          </div>
        ) : (
          <div className="collection-picker-list">
            {items.map((collection) => (
              <button
                key={collection.id}
                type="button"
                className={`collection-picker-item ${collection.contains ? 'is-in' : ''}`}
                onClick={() => void toggle(collection)}
                disabled={busyId === collection.id}
                aria-pressed={Boolean(collection.contains)}
              >
                <span className="collection-picker-check">
                  {collection.contains ? <Check size={15} /> : <Plus size={15} />}
                </span>
                <span className="collection-picker-copy">
                  <strong>{collection.title}</strong>
                  <small>{collection.item_count} работ</small>
                </span>
              </button>
            ))}
          </div>
        )}
        <form className="collection-create" onSubmit={(event) => void createAndAdd(event)}>
          <input
            className="input"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Новая коллекция"
            maxLength={80}
            aria-label="Название новой коллекции"
          />
          <button className="button button-dark" type="submit" disabled={creating || newTitle.trim().length < 2}>
            <Plus size={16} /> {creating ? 'Создаём…' : 'Создать'}
          </button>
        </form>
      </div>
    </div>
  );
}
