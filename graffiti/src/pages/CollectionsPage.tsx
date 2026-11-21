import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Images, Plus } from 'lucide-react';
import { api } from '../lib/api';
import type { CollectionSummary } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { CollectionFormDialog } from '../components/CollectionFormDialog';
import { ContentTabs } from '../components/ContentTabs';
import { formatDate } from '../lib/format';

export function CollectionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.collections();
      setItems(data.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить коллекции');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(payload: { title: string; description: string }) {
    const { collection } = await api.createCollection(payload);
    setCreating(false);
    navigate(`/collections/${collection.id}`);
  }

  return (
    <main className="page">
      <section className="collections-hero">
        <div>
          <span className="eyebrow">Подборки работ</span>
          <h1>Коллекции<br />Саратова</h1>
          <p>
            Собирайте граффити по темам: улыбки, портреты, надписи, любимые дворы.
            В одну подборку можно добавить работы из разных районов города.
          </p>
          <div className="hero-actions">
            {user ? (
              <button type="button" className="button button-dark" onClick={() => setCreating(true)}>
                <Plus size={17} /> Создать коллекцию
              </button>
            ) : (
              <Link to="/login" className="button button-dark">
                <Plus size={17} /> Создать коллекцию
              </Link>
            )}
          </div>
        </div>
        <div className="collections-hero-art">
          <Images size={54} />
          <strong>Соберите свою<br />историю города</strong>
          <span>Тема · район · настроение</span>
        </div>
      </section>

      <ContentTabs active="collections" />

      <section className="collections-section">
        <div className="feed-toolbar">
          <div className="feed-title">
            <span className="section-kicker">Подборки</span>
            <h2>Коллекции</h2>
          </div>
          <span className="collections-count">{items.length} подборок</span>
        </div>

        {error ? <div className="notice error">{error}</div> : null}

        {loading ? (
          <div className="collections-grid">
            {Array.from({ length: 3 }).map((_, index) => (
              <div className="collection-card-skeleton" key={index} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state collections-empty">
            <span className="empty-icon"><Images size={26} /></span>
            <h3>Пока ни одной коллекции</h3>
            <p>Создайте первую подборку и добавьте в неё работы из ленты.</p>
          </div>
        ) : (
          <div className="collections-grid">
            {items.map((collection) => (
              <Link to={`/collections/${collection.id}`} className="collection-card" key={collection.id}>
                <div className={`collection-cover count-${Math.min(3, collection.covers.length)}`}>
                  {collection.covers.length > 0 ? (
                    collection.covers.map((cover, index) => (
                      <img key={`${cover}-${index}`} src={cover} alt="" loading="lazy" />
                    ))
                  ) : (
                    <span className="collection-cover-empty"><Images size={26} /></span>
                  )}
                </div>
                <div className="collection-card-body">
                  <span className="section-kicker">Подборка · {collection.item_count}</span>
                  <h3>{collection.title}</h3>
                  {collection.description ? <p>{collection.description}</p> : null}
                  <div className="collection-card-meta">
                    <span>{collection.owner_name}</span>
                    <span>{formatDate(collection.created_at)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {creating ? (
        <CollectionFormDialog
          mode="create"
          onClose={() => setCreating(false)}
          onSubmit={create}
        />
      ) : null}
    </main>
  );
}
