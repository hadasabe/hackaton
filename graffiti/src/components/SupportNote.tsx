import { Send } from 'lucide-react';
import { useLocation } from 'react-router-dom';

export function SupportNote() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/walk') || pathname.startsWith('/r/')) return null;

  return (
    <div className="support-note">
      <a href="https://t.me/Xx_TimoxA_xX" target="_blank" rel="noreferrer">
        <span className="support-note-icon"><Send size={14} /></span>
        <span>Чат с поддержкой</span>
      </a>
    </div>
  );
}
