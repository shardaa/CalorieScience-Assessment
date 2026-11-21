import type { ClockTime, DateKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** Inclusive list of `count` dates ending at `end`. */
export function lastNDays(end: DateKey, count: number): DateKey[] {
  return Array.from({ length: count }, (_, i) => addDays(end, i - (count - 1)));
}

export function daysBetween(a: DateKey, b: DateKey): number {
  return Math.round((fromDateKey(b).getTime() - fromDateKey(a).getTime()) / 86_400_000);
}

export function isWorkday(key: DateKey): boolean {
  const dow = fromDateKey(key).getDay();
  return dow >= 1 && dow <= 5;
}

export function minutesOf(t: ClockTime): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function clockOf(minutes: number): ClockTime {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function clockNow(now: Date): ClockTime {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function formatClock(t: ClockTime): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

export function formatDay(key: DateKey, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric' }): string {
  return fromDateKey(key).toLocaleDateString('en-GB', opts);
}

export function formatLongDate(key: DateKey): string {
  return formatDay(key, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function relativeTime(iso: string, now: Date): string {
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)} h ago`;
  const days = Math.floor(diff / 86_400);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** ISO timestamp for a local date + clock time. */
export function at(key: DateKey, time: ClockTime): string {
  const d = fromDateKey(key);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
