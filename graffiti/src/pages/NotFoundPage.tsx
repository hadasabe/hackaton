import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';

export function NotFoundPage() {
  return (
    <main className="page page-narrow">
      <div className="not-found">
        <SearchX size={42} />
        <h1>Здесь ничего нет</h1>
        <p>Страница не существует или у вас нет доступа к этому разделу.</p>
        <Link to="/" className="button button-dark">К ленте</Link>
      </div>
    </main>
  );
}
