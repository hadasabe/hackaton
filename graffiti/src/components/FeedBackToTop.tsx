import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useLocation } from 'react-router-dom';

export function FeedBackToTop() {
  const { pathname } = useLocation();
  const isFeed = pathname === '/';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    if (!isFeed) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        setVisible(window.scrollY > 600);
        frame = 0;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [isFeed]);

  if (!isFeed) return null;

  return (
    <button
      type="button"
      className={`feed-back-to-top${visible ? ' visible' : ''}`}
      onClick={() => window.scrollTo({
        top: 0,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })}
      aria-label="Наверх"
    >
      <ArrowUp size={22} />
    </button>
  );
}
