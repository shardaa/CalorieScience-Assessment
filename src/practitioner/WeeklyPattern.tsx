import { CalendarDays, X } from 'lucide-react';
import { useState } from 'react';
import { useDb, useNow } from '../data/hooks';
import { buildCells, type Cell, type CellState } from '../domain/adherence';
import type { Analysis } from '../domain/insights';
import { HUNGER_LABEL, PREP_LABEL, REASON_LABEL, SLOT_LABEL, STATUS_LABEL } from '../domain/labels';
import { formatClock, formatDay, formatLongDate, isWorkday, minutesOf, toDateKey } from '../domain/time';
import { SLOTS } from '../domain/types';
import { EmptyState, StatusIcon } from '../ui/kit';

const ORDER: CellState[] = ['followed', 'partial', 'substituted', 'skipped', 'not_logged'];

export function WeeklyPattern({ a, clientId }: { a: Analysis; clientId: string }) {
  const db = useDb();
  const now = useNow();
  const today = toDateKey(now);
  const todayCells = buildCells(db, clientId, [today], now);
  const [sel, setSel] = useState<Cell | null>(null);
  const s = a.summary;

  const count = (st: CellState) => (st === 'not_logged' ? s.notLogged : s.counts[st as Exclude<CellState, 'not_logged' | 'upcoming'>]);
  const selected = sel ? [...a.cells, ...todayCells].find((c) => c.date === sel.date && c.slot === sel.slot) ?? null : null;

  if (s.due === 0) {
    return (
      <section className="panel">
        <EmptyState icon={<CalendarDays size={26} />} title="No adherence history yet">
          The programme started {a.cells.length ? 'recently' : 'today'}. Patterns appear here once the client has logged a few days.
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="pattern-title">
      <header className="panel-head">
        <h2 id="pattern-title">Planned vs reported · {s.due} meals</h2>
        <span className="panel-meta">
          {formatDay(a.window[0], { day: 'numeric', month: 'short' })} – {formatDay(a.window[6], { day: 'numeric', month: 'short' })}
        </span>
      </header>

      <div className="breakdown">
        <div className="stackbar" role="img" aria-label={ORDER.map((o) => `${STATUS_LABEL[o]} ${count(o)}`).join(', ')}>
          {ORDER.map((o) => (count(o) ? <span key={o} className={`c-${o}`} style={{ flex: count(o) }} title={`${STATUS_LABEL[o]}: ${count(o)}`} /> : null))}
        </div>
        <div className="legend">
          {ORDER.map((o) => (
            <span key={o} className="legend-item">
              <span className={`swatch c-${o}`} /> {STATUS_LABEL[o]} <strong>{count(o)}</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="grid-scroll">
        <table className="week-grid">
          <thead>
            <tr>
              <th className="row-h">Meal · planned</th>
              {a.window.map((d) => (
                <th key={d} className={isWorkday(d) ? '' : 'weekend'}>
                  <span>{formatDay(d, { weekday: 'short' })}</span>
                  <small>{formatDay(d, { day: 'numeric' })}</small>
                </th>
              ))}
              <th className="today-col">
                <span>Today</span>
                <small>so far</small>
              </th>
              <th className="row-sum">7-day pattern</th>
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => {
              const row = a.cells.filter((c) => c.slot === slot);
              const rs = a.bySlot[slot];
              const tc = todayCells.find((c) => c.slot === slot);
              return (
                <tr key={slot}>
                  <th className="row-h">
                    {SLOT_LABEL[slot]}
                    <small>{row[0] ? formatClock(row[0].planned.time) : ''}</small>
                  </th>
                  {a.window.map((d) => {
                    const c = row.find((x) => x.date === d);
                    if (!c) return <td key={d} className="cell c-none" />;
                    return <GridCell key={d} c={c} selected={sel?.date === d && sel.slot === slot} onClick={() => setSel(c)} weekend={!isWorkday(d)} />;
                  })}
                  {tc ? <GridCell c={tc} selected={sel?.date === today && sel.slot === slot} onClick={() => setSel(tc)} weekend={false} faded /> : <td className="cell c-none" />}
                  <td className="row-sum">
                    <div className="row-bar">
                      {ORDER.map((o) => {
                        const n = o === 'not_logged' ? rs.notLogged : rs.counts[o as 'followed'];
                        return n ? <span key={o} className={`c-${o}`} style={{ flex: n }} /> : null;
                      })}
                    </div>
                    <small>
                      {rs.counts.followed}/{rs.due} as planned
                    </small>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="grid-note">Weekends shaded · times shown when eaten 60+ min off plan · today is left out of the numbers · select a cell for the client's log</p>

      {selected && <CellDetail c={selected} onClose={() => setSel(null)} />}
    </section>
  );
}

function GridCell({ c, selected, onClick, weekend, faded }: { c: Cell; selected: boolean; onClick: () => void; weekend: boolean; faded?: boolean }) {
  const drift = c.log?.actualTime ? minutesOf(c.log.actualTime) - minutesOf(c.planned.time) : 0;
  return (
    <td className={`cell-td ${weekend ? 'weekend' : ''} ${faded ? 'faded' : ''}`}>
      <button
        className={`cell c-${c.state} ${selected ? 'is-sel' : ''} ${c.log?.comment ? 'has-comment' : ''}`}
        onClick={onClick}
        aria-label={`${formatLongDate(c.date)}, ${SLOT_LABEL[c.slot]}: ${STATUS_LABEL[c.state]}`}
      >
        <StatusIcon state={c.state} size={13} />
        {Math.abs(drift) >= 60 && <span className="cell-time">{formatClock(c.log!.actualTime!).replace(' ', '')}</span>}
      </button>
    </td>
  );
}

function CellDetail({ c, onClose }: { c: Cell; onClose: () => void }) {
  const l = c.log;
  const drift = l?.actualTime ? minutesOf(l.actualTime) - minutesOf(c.planned.time) : null;
  return (
    <div className="cell-detail" role="region" aria-label="Log detail">
      <header>
        <div>
          <p className="eyebrow">
            {formatLongDate(c.date)} · {isWorkday(c.date) ? 'workday' : 'weekend'}
          </p>
          <h3>
            {SLOT_LABEL[c.slot]} <span className={`pill pill-${c.state}`}>{STATUS_LABEL[c.state]}</span>
          </h3>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close detail">
          <X size={16} />
        </button>
      </header>
      <dl className="compare">
        <div>
          <dt>Planned (v{l?.planVersion ?? c.planVersion})</dt>
          <dd>
            {l?.plannedTitle ?? c.planned.title} · {formatClock(c.planned.time)}
          </dd>
        </div>
        <div>
          <dt>Client reported</dt>
          <dd>
            {!l && c.state === 'not_logged' && <em>No log. Unknown whether eaten.</em>}
            {!l && c.state === 'upcoming' && <em>Not due yet.</em>}
            {l && (
              <>
                {STATUS_LABEL[l.status]}
                {l.substitute && <>: {l.substitute}</>}
                {l.actualTime && (
                  <>
                    {' '}
                    at {formatClock(l.actualTime)}
                    {drift !== null && Math.abs(drift) >= 15 && <span className="muted"> ({drift > 0 ? '+' : ''}{drift} min)</span>}
                  </>
                )}
              </>
            )}
          </dd>
        </div>
        {l && l.reasons.length > 0 && (
          <div>
            <dt>Reasons</dt>
            <dd>{l.reasons.map((r) => REASON_LABEL[r]).join(', ')}</dd>
          </div>
        )}
        {l?.hunger && (
          <div>
            <dt>Hunger</dt>
            <dd>{HUNGER_LABEL[l.hunger]}</dd>
          </div>
        )}
        {l?.prepDifficulty && (
          <div>
            <dt>Preparation</dt>
            <dd>{PREP_LABEL[l.prepDifficulty]}</dd>
          </div>
        )}
        {l?.comment && (
          <div>
            <dt>Comment</dt>
            <dd>“{l.comment}”</dd>
          </div>
        )}
        {l && (
          <div>
            <dt>Logged</dt>
            <dd className="muted">
              {new Date(l.loggedAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
              {l.updatedAt !== l.loggedAt && ' · edited'}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
