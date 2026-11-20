import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  skipKey?: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);
const SKIP_PREFIX = 'stena-skip-confirm:';

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used within ConfirmProvider');
  return confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<{ options: ConfirmOptions; resolve: (value: boolean) => void } | null>(null);
  const [skip, setSkip] = useState(false);

  const confirm = useCallback<ConfirmFn>((options) => {
    if (options.skipKey) {
      try {
        if (localStorage.getItem(SKIP_PREFIX + options.skipKey) === '1') return Promise.resolve(true);
      } catch {
        // Storage may be unavailable; show the dialog.
      }
    }
    return new Promise<boolean>((resolve) => {
      setSkip(false);
      setDialog({ options, resolve });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    if (!dialog) return;
    if (value && skip && dialog.options.skipKey) {
      try {
        localStorage.setItem(SKIP_PREFIX + dialog.options.skipKey, '1');
      } catch {
        // Ignore storage errors.
      }
    }
    dialog.resolve(value);
    setDialog(null);
  }, [dialog, skip]);

  useEffect(() => {
    if (!dialog) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog ? (
        <div
          className="modal-backdrop confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close(false);
          }}
        >
          <div
            className="modal-card confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <div className="confirm-top">
              <span className="confirm-icon"><AlertTriangle size={24} /></span>
              <button type="button" className="icon-button" onClick={() => close(false)} aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>
            <div>
              <span className="section-kicker">Предупреждение</span>
              <h2 id="confirm-title">{dialog.options.title}</h2>
            </div>
            <p className="confirm-message">{dialog.options.message}</p>
            {dialog.options.skipKey ? (
              <label className="checkbox confirm-skip">
                <input type="checkbox" checked={skip} onChange={(event) => setSkip(event.target.checked)} />
                <span>Не предупреждать снова</span>
              </label>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="button button-outline" onClick={() => close(false)}>
                {dialog.options.cancelLabel || 'Отмена'}
              </button>
              <button type="button" className="button button-danger" onClick={() => close(true)}>
                {dialog.options.confirmLabel || 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}
