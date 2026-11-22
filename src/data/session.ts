import { useSyncExternalStore } from 'react';
import { PRIMARY_CLIENT_ID } from '../domain/seed';

/**
 * Who is signed in to the Companion app. A prototype stand-in for real auth:
 * the client signs in with their email (production would send a one-time code).
 * Starts signed in as Ananya so the demo opens on her day.
 */
const KEY = 'cs-companion/session';
const listeners = new Set<() => void>();

function read(): string | null {
  const v = localStorage.getItem(KEY);
  return v === null ? PRIMARY_CLIENT_ID : v === '' ? null : v;
}
let current = read();

function write(id: string | null) {
  current = id;
  localStorage.setItem(KEY, id ?? '');
  listeners.forEach((l) => l());
}

window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    current = read();
    listeners.forEach((l) => l());
  }
});

export const session = {
  signIn: (clientId: string) => write(clientId),
  signOut: () => write(null),
  reset: () => {
    localStorage.removeItem(KEY);
    current = read();
    listeners.forEach((l) => l());
  },
};

export function useSession(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
