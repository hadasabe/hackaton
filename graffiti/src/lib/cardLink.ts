import type { KeyboardEvent, MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';

const INTERACTIVE = 'a, button, input, textarea, select, label, [role="button"]';

export function cardLinkProps(path: string, navigate: (path: string) => void) {
  return {
    'data-card-link': 'true',
    role: 'link',
    tabIndex: 0,
    onClick(event: MouseEvent<HTMLElement>) {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(INTERACTIVE)) return;
      navigate(path);
    },
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target as HTMLElement | null;
      if (target && target !== event.currentTarget && target.closest(INTERACTIVE)) return;
      event.preventDefault();
      navigate(path);
    },
  };
}

export function useCardLink(path: string) {
  const navigate = useNavigate();
  return cardLinkProps(path, navigate);
}
