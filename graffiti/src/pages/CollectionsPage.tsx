import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Images } from 'lucide-react';
import { api } from '../lib/api';
import type { CollectionSummary } from '../lib/types';
import { FeedControls } from '../components/FeedControls';
import { ReportButton } from '../components/ReportButton';
import { formatDate } from '../lib/format';

export function CollectionsPage() {
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').trim().toLowerCase();
  const [items, setItems] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const visibleItems = query
    ? items.filter((item) => [item.title, item.description, item.owner_name].some((value) => String(value || '').toLowerCase().includes(query)))
    : items;

  return (
    <main className="page">
      <FeedControls active="collections" />

      <section className="collections-section">
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
              <article className="collection-card" key={collection.id}>
                <Link to={`/collections/${collection.id}`} className="collection-card-link">
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
                <div className="collection-card-report">
                  <ReportButton targetType="collection" targetId={collection.id} title={collection.title} className="card-report-link" />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
