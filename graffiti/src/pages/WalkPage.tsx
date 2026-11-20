import { useEffect } from 'react';

export function WalkPage() {
  useEffect(() => {
    document.body.classList.add('walk-route');
    return () => document.body.classList.remove('walk-route');
  }, []);

  return (
    <main className="walk-embed-page">
      <iframe
        className="walk-embed"
        src="/walk-app/?embed=1"
        title="АРТ-ПРОГУЛКА — маршруты по уличному искусству"
        allow="geolocation"
      />
    </main>
  );
}
