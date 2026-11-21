import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ValidationError } from '../domain/commands';
import type { Database } from '../domain/types';
import { backend } from './backend';

export function useDb(): Database {
  return useSyncExternalStore(backend.subscribe, backend.getSnapshot);
}

export function useSettings() {
  return useSyncExternalStore(backend.subscribe, backend.getSettings);
}

/** Re-renders every 30s so "due" states and relative times stay correct. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

/** Simulated initial fetch for a screen. `key` re-triggers it (e.g. selected client). */
export function useLoad(key: string): LoadState & { retry: () => void } {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    backend
      .fetch()
      .then(() => alive && setState({ status: 'ready' }))
      .catch((e: Error) => alive && setState({ status: 'error', message: e.message }));
    return () => {
      alive = false;
    };
  }, [key, attempt]);
  return { ...state, retry: () => setAttempt((a) => a + 1) };
}

// ---------------- Toasts ----------------

interface Toast {
  id: number;
  tone: 'success' | 'error' | 'info';
  text: string;
  action?: { label: string; run: () => void };
}

const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId.current++;
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.tone === 'error' ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  setToasts((ts) => ts.filter((x) => x.id !== t.id));
                  t.action!.run();
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/**
 * Wraps a backend command with pending/error handling.
 * Validation errors are returned inline (form shows them); network errors toast with Retry.
 */
export function useMutation() {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (command: (db: Database, now: Date) => Database, opts: { success?: string } = {}): Promise<boolean> => {
      setPending(true);
      setError(null);
      try {
        await backend.run(command);
        if (opts.success) toast({ tone: 'success', text: opts.success });
        return true;
      } catch (e) {
        if (e instanceof ValidationError) {
          setError(e.message);
        } else {
          setError((e as Error).message);
          toast({ tone: 'error', text: "Not saved. You're offline.", action: { label: 'Retry', run: () => void run(command, opts) } });
        }
        return false;
      } finally {
        setPending(false);
      }
    },
    [toast],
  );

  return { run, pending, error, clearError: () => setError(null) };
}
