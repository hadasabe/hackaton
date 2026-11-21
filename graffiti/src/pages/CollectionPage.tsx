import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Images, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { CollectionSummary, Graffiti, ReactionValue } from '../lib/types';
import { GraffitiCard } from '../components/GraffitiCard';
import { CollectionFormDialog } from '../components/CollectionFormDialog';
import { useConfirm } from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/format';
import { NotFoundPage } from './NotFoundPage';

export function CollectionPage() {
  const { id } = useParams();
  const numericId = Number(id);
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<CollectionSummary | null>(null);
  const [items, setItems] = useState<Graffiti[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(numericId)) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.collection(numericId);
      setCollection(data.collection);
      setItems(data.items);
      setNotFound(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) setNotFound(true);
      else setError(caught instanceof Error ? caught.message : 'Не удалось загрузить коллекцию');
    } finally {
      setLoading(false);
    }
  }, [numericId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function react(item: Graffiti, value: ReactionValue) {
    if (!user) {
      navigate('/login', { state: { from: `/collections/${numericId}` } });
      return;
    }
    const previous = item.my_reaction;
    let likes = item.likes;
    let dislikes = item.dislikes;
    if (previous === 'like') likes -= 1;
    if (previous === 'dislike') dislikes -= 1;
    if (value === 'like') likes += 1;
    else dislikes += 1;
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, likes, dislikes, my_reaction: value } : entry,
      ),
    );
    try {
      const result = await api.react(item.id, value);
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, ...result } : entry)),
      );
    } catch {
      await load();
    }
  }

  async function removeItem(item: Graffiti) {
    const confirmed = await confirm({
      title: 'Убрать работу из коллекции?',
      message: 'Работа останется в ленте, но исчезнет из этой подборки.',
      confirmLabel: 'Убрать',
      skipKey: 'collection-remove',
    });
    if (!confirmed) return;
    try {
      await api.removeFromCollection(numericId, item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setCollection((current) =>
        current
          ? {
              ...current,
              item_count: Math.max(0, current.item_count - 1),
              covers: current.covers.filter((cover) => cover !== item.image_path),
            }
          : current,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось убрать работу');
    }
  }

  async function removeCollection() {
    const confirmed = await confirm({
      title: 'Удалить коллекцию?',
      message: 'Подборка исчезнет, а работы останутся в ленте.',
      confirmLabel: 'Удалить',
      skipKey: 'delete-collection',
    });
    if (!confirmed) return;
    try {
      await api.deleteCollection(numericId);
      navigate('/collections');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить коллекцию');
    }
  }

  async function save(payload: { title: string; description: string }) {
    await api.updateCollection(numericId, payload);
    setEditing(false);
    await load();
  }

  if (notFound) return <NotFoundPage />;

  if (loading) {
    return (
      <main className="page">
        <div className="detail-skeleton" />
      </main>
    );
  }

  if (!collection) {
    return (
      <main className="page page-narrow">
        <div className="notice error">{error || 'Коллекция не найдена'}</div>
        <Link to="/collections" className="button button-outline">
          <ArrowLeft size={16} /> Все коллекции
        </Link>
      </main>
    );
  }

  return (
    <main className="page">
      <Link to="/collections" className="back-link"><ArrowLeft size={16} /> Все коллекции</Link>

      <section className="collection-detail-hero">
        <div className={`collection-detail-cover count-${Math.min(3, collection.covers.length)}`}>
          {collection.covers.length > 0 ? (
            collection.covers.map((cover, index) => (
              <img key={`${cover}-${index}`} src={cover} alt="" loading="lazy" />
            ))
          ) : (
            <span className="collection-cover-empty"><Images size={32} /></span>
          )}
        </div>
        <div className="collection-detail-copy">
          <span className="section-kicker">Коллекция · {collection.item_count} работ</span>
          <h1>{collection.title}</h1>
          {collection.description ? <p>{collection.description}</p> : null}
          <div className="collection-meta-row">
            <span>Автор: {collection.owner_name}</span>
            <span>{formatDate(collection.created_at)}</span>
          </div>
          <div className="hero-actions">
            {collection.can_edit ? (
              <>
                <button type="button" className="button button-dark" onClick={() => setEditing(true)}>
                  <Pencil size={16} /> Редактировать
                </button>
                <button type="button" className="button button-outline collection-delete" onClick={() => void removeCollection()}>
                  <Trash2 size={16} /> Удалить
                </button>
              </>
            ) : null}
            <Link to="/" className="button button-outline"><Plus size={16} /> Найти работы</Link>
          </div>
        </div>
      </section>

      {error ? <div className="notice error">{error}</div> : null}

      <section className="collection-works">
        <div className="feed-toolbar">
          <div className="feed-title">
            <span className="section-kicker">Работы</span>
            <h2>В этой коллекции</h2>
          </div>
          <span className="collections-count">{items.length} работ</span>
        </div>
        {items.length === 0 ? (
          <div className="empty-state collections-empty">
            <span className="empty-icon"><Images size={26} /></span>
            <h3>Коллекция пока пустая</h3>
            <p>
              Откройте работу в ленте и нажмите «В коллекцию», чтобы добавить её сюда.
            </p>
            <Link to="/" className="button button-dark"><Plus size={16} /> Перейти к ленте</Link>
          </div>
        ) : (
          <div className="collection-grid">
            {items.map((item) => (
              <div className="collection-item" key={item.id}>
                <GraffitiCard item={item} onReact={(value) => void react(item, value)} />
                {collection.can_edit ? (
                  <button
                    type="button"
                    className="collection-remove"
                    onClick={() => void removeItem(item)}
                    aria-label={`Убрать из коллекции: ${item.address}`}
                  >
                    <Trash2 size={14} /> Убрать
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {editing ? (
        <CollectionFormDialog
          mode="edit"
          initialTitle={collection.title}
          initialDescription={collection.description}
          onClose={() => setEditing(false)}
          onSubmit={save}
        />
      ) : null}
    </main>
  );
}
