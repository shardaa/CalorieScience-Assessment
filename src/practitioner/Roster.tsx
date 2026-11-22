import { ChevronRight, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDb, useLoad, useNow } from '../data/hooks';
import { pct } from '../domain/adherence';
import { analyse, type Analysis, type TriggerCode } from '../domain/insights';
import { daysBetween, relativeTime, toDateKey } from '../domain/time';
import type { Client } from '../domain/types';
import { SLOTS } from '../domain/types';
import { Avatar, EmptyState, ErrorState, SkeletonList } from '../ui/kit';

type Filter = 'attention' | 'feedback' | 'gaps' | 'flagged' | 'all';

const FILTERS: [Filter, string, (a: Analysis) => boolean][] = [
  ['attention', 'Needs attention', (a) => a.priority >= 20],
  ['feedback', 'New feedback', (a) => has(a, 'new_feedback')],
  ['gaps', 'Logging gaps', (a) => has(a, 'logging_gap') || has(a, 'no_logs')],
  ['flagged', 'Flagged', (a) => has(a, 'flagged')],
  ['all', 'All clients', () => true],
];

function has(a: Analysis, code: TriggerCode) {
  return a.triggers.some((t) => t.code === code);
}

export function Roster({ onOpen }: { onOpen: (id: string) => void }) {
  const db = useDb();
  const now = useNow();
  const load = useLoad('roster');
  const [filter, setFilter] = useState<Filter>('attention');
  const [q, setQ] = useState('');

  // One analysis per client. At 50–100 clients this is still < 5 ms; in production it
  // would be computed server-side on log write and stored as a denormalised summary.
  const rows = useMemo(
    () =>
      db.clients
        .map((c) => ({ client: c, a: analyse(db, c.id, now) }))
        .sort((x, y) => y.a.priority - x.a.priority || x.client.name.localeCompare(y.client.name)),
    [db, now],
  );

  const counts = Object.fromEntries(FILTERS.map(([k, , fn]) => [k, rows.filter((r) => fn(r.a)).length])) as Record<Filter, number>;
  const fn = FILTERS.find((f) => f[0] === filter)![2];
  const visible = rows.filter((r) => fn(r.a) && r.client.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="pr-page enter">
      <div className="page-head">
        <div>
          <p className="eyebrow">Caseload · {db.clients.length} active clients</p>
          <h1>Who needs you this week</h1>
          <p className="muted">Sorted by what changed since your last review. Clients you've reviewed sink until something new arrives.</p>
        </div>
        <label className="search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients" aria-label="Search clients" />
        </label>
      </div>

      <div className="filter-tiles" role="tablist" aria-label="Filter clients">
        {FILTERS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} className={`filter-tile ${filter === k ? 'is-on' : ''} ft-${k}`} onClick={() => setFilter(k)}>
            <span className="ft-count">{counts[k]}</span>
            <span className="ft-label">{label}</span>
          </button>
        ))}
      </div>

      {load.status === 'loading' && <SkeletonList rows={6} h={72} />}
      {load.status === 'error' && <ErrorState message={load.message} onRetry={load.retry} />}
      {load.status === 'ready' && (
        <div className="roster" role="table" aria-label="Client adherence">
          <div className="roster-row roster-headrow" role="row">
            <span role="columnheader">Client</span>
            <span role="columnheader">Why it's surfaced</span>
            <span role="columnheader" title="Meals × last 7 days">Last 7 days</span>
            <span role="columnheader" title="Of logged meals">Alignment</span>
            <span role="columnheader" title="Logged ÷ due">Logged</span>
            <span role="columnheader">Review</span>
            <span />
          </div>
          {visible.length === 0 && (
            <EmptyState icon={<Users size={24} />} title={q ? 'No clients match that search' : 'Nobody here right now'}>
              {filter === 'attention' ? 'No client currently meets an attention trigger. Nice.' : 'Try another filter.'}
            </EmptyState>
          )}
          {visible.map(({ client, a }) => (
            <RosterRow key={client.id} client={client} a={a} now={now} onOpen={() => onOpen(client.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RosterRow({ client, a, now, onOpen }: { client: Client; a: Analysis; now: Date; onOpen: () => void }) {
  const db = useDb();
  const cs = db.caseStates.find((c) => c.clientId === client.id);
  const week = Math.min(client.programmeWeeks, Math.floor(daysBetween(client.programmeStart, toDateKey(now)) / 7) + 1);
  return (
    <button className="roster-row" role="row" onClick={onOpen}>
      <span className="who" role="cell">
        <Avatar name={client.name} hue={client.avatarHue} />
        <span>
          <strong>{client.name}</strong>
          <small>
            Week {week}/{client.programmeWeeks} · {client.goal}
          </small>
        </span>
      </span>
      <span className="triggers" role="cell">
        {a.triggers.length === 0 && <span className="trigger trigger-ok">On track</span>}
        {a.triggers.slice(0, 3).map((t) => (
          <span key={t.code + (t.slot ?? '')} className={`trigger trigger-${t.severity}`}>
            {t.label}
          </span>
        ))}
        {a.triggers.length > 3 && <span className="trigger">+{a.triggers.length - 3}</span>}
      </span>
      <span role="cell">
        <MiniGrid a={a} />
      </span>
      <span role="cell" className="num">
        {pct(a.summary.alignment)}
      </span>
      <span role="cell" className={`num ${a.summary.completeness !== null && a.summary.completeness < 0.6 ? 'num-warn' : ''}`}>
        {pct(a.summary.completeness)}
      </span>
      <span role="cell" className="review">
        {cs?.lastReviewedAt ? (
          a.newSinceReview ? (
            <span className="new-dot">New since review</span>
          ) : (
            <span className="muted small">Reviewed {relativeTime(cs.lastReviewedAt, now)}</span>
          )
        ) : (
          <span className="new-dot">Not yet reviewed</span>
        )}
      </span>
      <ChevronRight size={16} className="muted" />
    </button>
  );
}

/** 4×7 micro heatmap: meal rows × days. Scales visually to large caseloads. */
export function MiniGrid({ a }: { a: Analysis }) {
  return (
    <span className="mini-grid" aria-label={`${a.summary.logged} of ${a.summary.due} meals logged`}>
      {SLOTS.map((s) => (
        <span key={s} className="mini-row">
          {a.window.map((d) => {
            const c = a.cells.find((x) => x.date === d && x.slot === s);
            return <span key={d} className={`mini c-${c ? c.state : 'none'}`} />;
          })}
        </span>
      ))}
    </span>
  );
}
