import { Send } from 'lucide-react';

export function SupportNote() {
  return (
    <div className="support-note">
      <a href="https://t.me/Xx_TimoxA_xX" target="_blank" rel="noreferrer">
        <span className="support-note-icon"><Send size={14} /></span>
        <span>Чат с поддержкой</span>
      </a>
    </div>
  );
}
