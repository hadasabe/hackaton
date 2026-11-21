import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

export function WalkPage() {
  const { slug } = useParams<{ slug?: string }>();
  useEffect(() => {
    document.body.classList.add('walk-route');
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; value?: boolean } | null;
      if (data?.type === 'walk:fullscreen') {
        document.body.classList.toggle('walk-fullscreen', Boolean(data.value));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      document.body.classList.remove('walk-route');
      document.body.classList.remove('walk-fullscreen');
    };
  }, []);

  const src = `/walk-app/?embed=1&v=96${slug ? `&route=${encodeURIComponent(slug)}` : ''}`;

  return (
    <main className="walk-embed-page">
      <iframe
        className="walk-embed"
        src={src}
        title="Туристический Саратов — прогулка"
        allow="geolocation"
      />
    </main>
  );
}
