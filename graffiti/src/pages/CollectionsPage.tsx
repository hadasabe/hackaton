import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Images, Plus } from 'lucide-react';
import { api } from '../lib/api';
import type { CollectionSummary } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { CollectionFormDialog } from '../components/CollectionFormDialog';
import { FeedControls } from '../components/FeedControls';
import { formatDate } from '../lib/format';

export function CollectionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').trim().toLowerCase();
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

  const visibleItems = query
    ? items.filter((item) => [item.title, item.description, item.owner_name].some((value) => String(value || '').toLowerCase().includes(query)))
    : items;

  return (
    <main className="page">
      <FeedControls active="collections" />

      <section className="collections-section">
        <div className="collections-toolbar">
          <span className="collections-count">{query ? `${items.filter((item) => [item.title, item.description, item.owner_name].some((value) => String(value || '').toLowerCase().includes(query))).length} найдено` : `${items.length} подборок`}</span>
          {user ? (
            <button type="button" className="button button-dark" onClick={() => setCreating(true)}>
              <Plus size={16} /> Создать коллекцию
            </button>
          ) : (
            <Link to="/login" className="button button-dark"><Plus size={16} /> Создать коллекцию</Link>
          )}
        </div>

        {error ? <div className="notice error">{error}</div> : null}

        {loading ? (
          <div className="collections-grid">
            {Array.from({ length: 3 }).map((_, index) => (
              <div className="collection-card-skeleton" key={index} />
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="empty-state collections-empty">
            <span className="empty-icon"><Images size={26} /></span>
            <h3>Пока ни одной коллекции</h3>
            <p>Создайте первую подборку и добавьте в неё работы из ленты.</p>
          </div>
        ) : (
          <div className="collections-grid">
            {visibleItems.map((collection) => (
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
