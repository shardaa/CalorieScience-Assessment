import { CalendarDays, Leaf, MessageCircle } from 'lucide-react';
import { useDb, useNow } from '../data/hooks';
import { buildCells, summarize } from '../domain/adherence';
import { CLIENT_STATUS_LABEL } from '../domain/labels';
import { formatDay, lastNDays, toDateKey } from '../domain/time';
import type { Client } from '../domain/types';
import { EmptyState, StatusIcon } from '../ui/kit';
import type { Draft } from './ClientApp';

/**
 * Deliberately no percentage/score here. The client sees what they logged and
 * what felt hard, and is nudged to *explain* rather than to *perform*.
 */
export function ProgressScreen({ client, onTell }: { client: Client; onTell: (d: Draft) => void }) {
  const db = useDb();
  const now = useNow();
  const today = toDateKey(now);
  const practitioner = db.practitioner.name.split(' ')[0];
  const todayCells = buildCells(db, client.id, [today], now);
  const week = lastNDays(today, 7);
  const weekCells = buildCells(db, client.id, week, now);
  const weekSummary = summarize(weekCells);
  const logged = todayCells.filter((c) => c.log);
  const went = logged.filter((c) => c.log!.status === 'followed');
  const tricky = logged.filter((c) => c.log!.status !== 'followed');

  return (
    <div className="client-pad">
      <header className="client-header">
        <h1>My week</h1>
        <p className="hello-sub">Check-ins, not scores. Every log helps.</p>
      </header>

      <section className="card ring-card">
        <Ring value={logged.length} total={todayCells.length} />
        <div>
          <strong>
            {logged.length} of {todayCells.length} meals logged
          </strong>
          <p className="muted">
            {logged.length === 0
              ? 'Nothing logged yet today. Check in after your next meal.'
              : logged.length === todayCells.length
                ? `That's a complete picture of your day for ${practitioner}.`
                : 'Each check-in, even a skipped meal, helps tailor your plan.'}
          </p>
        </div>
      </section>

      {logged.length > 0 && (
        <div className="two-col">
          <section className="card">
            <h3 className="card-title">
              <Leaf size={15} /> What went to plan
            </h3>
            {went.length ? (
              <ul className="plain">
                {went.map((c) => (
                  <li key={c.slot}>
                    <StatusIcon state="followed" /> {c.planned.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Nothing yet, and that's okay. Some days are like that.</p>
            )}
          </section>
          <section className="card">
            <h3 className="card-title">What was tricky</h3>
            {tricky.length ? (
              <ul className="plain">
                {tricky.map((c) => (
                  <li key={c.slot}>
                    <StatusIcon state={c.log!.status} /> {c.planned.label}
                    <span className="muted small"> · {CLIENT_STATUS_LABEL[c.log!.status].toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Nothing so far.</p>
            )}
            {tricky.length > 0 && (
              <button className="link-btn" onClick={() => onTell({ slot: tricky[0].slot })}>
                <MessageCircle size={13} /> Tell {practitioner} what got in the way
              </button>
            )}
          </section>
        </div>
      )}

      <section className="card">
        <h3 className="card-title">
          <CalendarDays size={15} /> Check-ins this week
        </h3>
        {weekSummary.logged === 0 && weekSummary.due === 0 ? (
          <EmptyState icon={<CalendarDays size={22} />} title="Your week starts today">
            Logged meals will build up here.
          </EmptyState>
        ) : (
          <>
            <div className="week-bars" role="img" aria-label={week.map((d) => `${formatDay(d, { weekday: 'long' })}: ${weekCells.filter((c) => c.date === d && c.log).length} logged`).join(', ')}>
              {week.map((d) => {
                const dayCells = weekCells.filter((c) => c.date === d);
                const n = dayCells.filter((c) => c.log).length;
                const total = Math.max(4, dayCells.length);
                return (
                  <div key={d} className={`wbar ${d === today ? 'is-today' : ''}`}>
                    {d === today && <span className="wbar-tip">{n}/{dayCells.length}</span>}
                    <span className="wbar-track">
                      <span className="wbar-fill" style={{ height: `${Math.max(6, (n / total) * 100)}%` }} />
                    </span>
                    <span className="wd">{formatDay(d, { weekday: 'short' })}</span>
                  </div>
                );
              })}
            </div>
            <p className="muted small">
              {weekSummary.logged} meals logged this week, including {weekSummary.logged - weekSummary.counts.followed} that didn't go to plan. Those are often the most useful for {practitioner}.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function Ring({ value, total }: { value: number; total: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const frac = total ? value / total : 0;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden>
      <circle cx="34" cy="34" r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
      <circle cx="34" cy="34" r={r} fill="none" stroke="var(--brand)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} transform="rotate(-90 34 34)" />
      <text x="34" y="39" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--ink)">
        {value}/{total}
      </text>
    </svg>
  );
}
