import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

export function WalkPage() {
  const { slug } = useParams<{ slug?: string }>();
  useEffect(() => {
    document.body.classList.add('walk-route');
    return () => document.body.classList.remove('walk-route');
  }, []);

  const src = `/walk-app/?embed=1&v=35${slug ? `&route=${encodeURIComponent(slug)}` : ''}`;

  return (
    <main className="walk-embed-page">
      <iframe
        className="walk-embed"
        src={src}
        title="АРТ-ПРОГУЛКА — маршруты по уличному искусству"
        allow="geolocation"
      />
    </main>
  );
}
