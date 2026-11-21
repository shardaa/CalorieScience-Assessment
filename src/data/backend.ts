import { createSeed, SCHEMA_VERSION } from '../domain/seed';
import { toDateKey } from '../domain/time';
import type { Database } from '../domain/types';

/**
 * SIMULATED BACKEND
 *
 * Stands in for a REST/GraphQL API + database. Data lives in localStorage and is
 * shared live between the client app and the practitioner dashboard — both in
 * the same page (split demo view) and across browser tabs (BroadcastChannel).
 *
 * Every request goes through `request()`, which adds latency and can be told to
 * fail, so loading/error/retry states are real code paths rather than mock-ups.
 *
 * Production: replace with an API client (e.g. Supabase/Postgres or a Node
 * service), keep the same command functions server-side, and push changes to
 * the other party via websockets/SSE + mobile push notifications.
 */

const DB_KEY = 'cs-companion/db';
const SETTINGS_KEY = 'cs-companion/settings';

export class NetworkError extends Error {
  constructor() {
    super("Couldn't reach CalorieScience. Check your connection and try again.");
  }
}

export interface DemoSettings {
  latency: 'fast' | 'normal' | 'slow';
  offline: boolean;
}

const LATENCY_MS: Record<DemoSettings['latency'], number> = { fast: 60, normal: 450, slow: 1600 };

type Listener = () => void;

class Backend {
  private db: Database;
  private settings: DemoSettings;
  private listeners = new Set<Listener>();
  private channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cs-companion') : null;

  constructor() {
    this.settings = this.readSettings();
    this.db = this.readDb();
    this.channel?.addEventListener('message', (e) => {
      if (e.data === 'db') {
        this.db = this.readDb();
        this.emit();
      }
      if (e.data === 'settings') {
        this.settings = this.readSettings();
        this.emit();
      }
    });
  }

  private readDb(): Database {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Database;
        // Seed data is relative to "today"; re-seed on a new day or schema change
        // so the demo always shows a coherent last-7-days.
        if (parsed.schemaVersion === SCHEMA_VERSION && parsed.seededFor === toDateKey(new Date())) return parsed;
      }
    } catch {
      /* corrupted storage → fall through to a fresh seed */
    }
    const fresh = createSeed(new Date());
    this.persist(fresh);
    return fresh;
  }

  private readSettings(): DemoSettings {
    try {
      return { latency: 'normal', offline: false, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
    } catch {
      return { latency: 'normal', offline: false };
    }
  }

  private persist(db: Database) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch {
      /* storage full / private mode: keep working in memory */
    }
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = () => this.db;
  getSettings = () => this.settings;

  private async network() {
    const base = LATENCY_MS[this.settings.latency];
    await new Promise((r) => setTimeout(r, base * (0.7 + Math.random() * 0.6)));
    if (this.settings.offline) throw new NetworkError();
  }

  /** Simulated GET: resolves once the "server" responds. Data is then read via the snapshot. */
  async fetch(): Promise<void> {
    await this.network();
  }

  /** Simulated POST: runs a pure command against a copy, commits only on success. */
  async run(command: (db: Database, now: Date) => Database): Promise<void> {
    await this.network();
    const next = command(structuredClone(this.db), new Date());
    this.db = next;
    this.persist(next);
    this.channel?.postMessage('db');
    this.emit();
  }

  updateSettings(patch: Partial<DemoSettings>) {
    this.settings = { ...this.settings, ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    this.channel?.postMessage('settings');
    this.emit();
  }

  reset(extraClients = 0) {
    this.db = createSeed(new Date(), extraClients);
    this.persist(this.db);
    this.channel?.postMessage('db');
    this.emit();
  }
}

export const backend = new Backend();
