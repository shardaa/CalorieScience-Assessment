import { ArrowLeftRight, Check, CircleDashed, CircleHelp, Clock, LoaderCircle, RotateCcw, WifiOff, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CellState } from '../domain/adherence';
import { STATUS_LABEL } from '../domain/labels';

const ICONS: Record<CellState, typeof Check> = {
  followed: Check,
  partial: CircleDashed,
  substituted: ArrowLeftRight,
  skipped: X,
  not_logged: CircleHelp,
  upcoming: Clock,
};

/** Status is always conveyed by icon + label, never by colour alone. */
export function StatusIcon({ state, size = 14 }: { state: CellState; size?: number }) {
  const Icon = ICONS[state];
  return <Icon size={size} strokeWidth={2.4} aria-label={STATUS_LABEL[state]} />;
}

export function StatusPill({ state, label }: { state: CellState; label?: string }) {
  return (
    <span className={`pill pill-${state}`}>
      <StatusIcon state={state} size={12} />
      {label ?? STATUS_LABEL[state]}
    </span>
  );
}

export function Avatar({ name, hue, size = 36 }: { name: string; hue: number; size?: number }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 45% 88%)`, color: `hsl(${hue} 45% 28%)` }} aria-hidden>
      {initials}
    </span>
  );
}

export function Skeleton({ h = 16, w = '100%', r = 8 }: { h?: number; w?: number | string; r?: number }) {
  return <span className="skeleton" style={{ height: h, width: w, borderRadius: r }} />;
}

export function SkeletonList({ rows = 4, h = 64 }: { rows?: number; h?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={h} r={14} />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="state-box" role="alert">
      <WifiOff size={28} />
      <strong>Couldn't load this</strong>
      <p>{message}</p>
      <button className="btn btn-primary" onClick={onRetry}>
        <RotateCcw size={14} /> Try again
      </button>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="state-box state-empty">
      {icon}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <LoaderCircle size={size} className="spin" aria-label="Saving" />;
}

export function Chip({ active, onClick, children, tone }: { active?: boolean; onClick?: () => void; children: ReactNode; tone?: string }) {
  return (
    <button type="button" className={`chip ${active ? 'chip-active' : ''} ${tone ? `chip-${tone}` : ''}`} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}
