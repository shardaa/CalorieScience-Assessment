import { Check, ChevronDown, ChevronRight, Clock, Pencil, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useDb, useMutation, useNow } from '../data/hooks';
import { buildCells, currentPlan, type Cell } from '../domain/adherence';
import { logMeal, markRecommendationSeen } from '../domain/commands';
import { CLIENT_STATUS_LABEL } from '../domain/labels';
import { clockNow, daysBetween, formatClock, formatLongDate, minutesOf, toDateKey } from '../domain/time';
import type { Client, Message } from '../domain/types';
import { EmptyState, Spinner, StatusIcon } from '../ui/kit';
import type { Draft } from './ClientApp';
import { LogSheet } from './LogSheet';

function greeting(now: Date) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function TodayScreen({ client, onTell }: { client: Client; onTell: (d: Draft) => void }) {
  const db = useDb();
  const now = useNow();
  const today = toDateKey(now);
  const plan = currentPlan(db, client.id, now);
  const cells = buildCells(db, client.id, [today], now);
  const [sheet, setSheet] = useState<Cell | null>(null);
  const practitioner = db.practitioner.name.split(' ')[0];

  const week = Math.min(client.programmeWeeks, Math.floor(daysBetween(client.programmeStart, today) / 7) + 1);
  const logged = cells.filter((c) => c.log).length;
  const nowMin = minutesOf(clockNow(now));
  // "Up next": the first unlogged meal whose time is within reach (or already passed).
  const upNext = cells.find((c) => !c.log && minutesOf(c.planned.time) - 120 <= nowMin) ?? cells.find((c) => !c.log);

  const unseen = db.messages
    .filter((m) => m.clientId === client.id && m.author === 'practitioner' && !m.seenByClientAt)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // Most recent practitioner tip per meal (last 14 days) — shown inline on that meal.
  const tipFor = (slot: string): Message | undefined =>
    db.messages
      .filter((m) => m.clientId === client.id && m.author === 'practitioner' && m.slot === slot && daysBetween(m.createdAt.slice(0, 10), today) <= 14)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];

  if (!plan) {
    return (
      <div className="client-pad">
        <EmptyState icon={<Clock size={28} />} title="Your plan isn't ready yet">
          {practitioner} is preparing your meal plan. You'll see it here as soon as it's shared.
        </EmptyState>
      </div>
    );
  }

  const isUpdated = (c: Cell) => plan.changedSlots?.includes(c.slot) && daysBetween(plan.effectiveFrom, today) <= 7 && c.planVersion === plan.version;

  return (
    <div className="client-pad enter">
      <header className="client-header today-head">
        <div>
          <p className="eyebrow">
            {formatLongDate(today)} · Week {week} of {client.programmeWeeks}
          </p>
          <h1>
            {greeting(now)},
            <br />
            {client.name.split(' ')[0]}
          </h1>
        </div>
        <div className="day-count" aria-label={`${logged} of ${cells.length} meals logged today`}>
          <strong>
            {logged}
            <span>/{cells.length}</span>
          </strong>
          <small>logged</small>
        </div>
      </header>

      {unseen.map((m) => (
        <PractitionerCard key={m.id} message={m} from={db.practitioner.name} />
      ))}

      {upNext && (
        <MealCard
          hero
          cell={upNext}
          clientId={client.id}
          updated={!!isUpdated(upNext)}
          tip={tipFor(upNext.slot)}
          practitioner={practitioner}
          onOpen={() => setSheet(upNext)}
        />
      )}
      {!upNext && (
        <section className="day-done">
          <Check size={20} />
          <div>
            <strong>Every meal is logged</strong>
            <p>That's a complete picture of today for {practitioner}. Thank you.</p>
          </div>
        </section>
      )}

      <section aria-labelledby="day-title">
        <h2 className="list-title" id="day-title">
          Your day
        </h2>
        <ol className="day-list">
          {cells
            .filter((c) => c.slot !== upNext?.slot)
            .map((c) => (
              <MealCard key={c.slot} cell={c} clientId={client.id} updated={!!isUpdated(c)} tip={tipFor(c.slot)} practitioner={practitioner} onOpen={() => setSheet(c)} />
            ))}
        </ol>
      </section>

      <button className="tell-card" onClick={() => onTell({})}>
        <span>
          <strong>Something not working?</strong>
          <small>Tell {practitioner} what gets in the way so your plan can change with you.</small>
        </span>
        <ChevronRight size={18} />
      </button>

      {sheet && <LogSheet cell={sheet} clientId={client.id} practitioner={practitioner} onClose={() => setSheet(null)} onTell={onTell} />}
    </div>
  );
}

function PractitionerCard({ message, from }: { message: Message; from: string }) {
  const m = useMutation();
  return (
    <section className="pr-card" aria-label={`Message from ${from}`}>
      <div className="pr-card-head">
        <Sparkles size={16} />
        <span>
          {message.adjustmentId ? 'Your plan was updated' : message.inReplyTo ? `${from.split(' ')[0]} replied` : `New from ${from.split(' ')[0]}`}
        </span>
      </div>
      <p>{message.body}</p>
      <button className="btn btn-light" disabled={m.pending} onClick={() => m.run((db, now) => markRecommendationSeen(db, message.id, now))}>
        {m.pending ? <Spinner /> : <Check size={14} />} Got it
      </button>
    </section>
  );
}

function MealCard({
  cell,
  clientId,
  hero,
  updated,
  tip,
  practitioner,
  onOpen,
}: {
  cell: Cell;
  clientId: string;
  hero?: boolean;
  updated: boolean;
  tip?: Message;
  practitioner: string;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const quick = useMutation();
  const { planned, log } = cell;

  const quickLog = () =>
    quick.run((db, now) => logMeal(db, { clientId, date: cell.date, slot: cell.slot, status: 'followed', actualTime: planned.time }, now), {
      success: `${planned.label} logged`,
    });

  if (hero) {
    return (
      <section className="hero-meal" aria-label={`Up next: ${planned.label}`}>
        <div className="hero-top">
          <span className="hero-kicker">Up next · {planned.label}</span>
          <span className="hero-time">{formatClock(planned.time)}</span>
        </div>
        {updated && <span className="hero-updated">Updated by {practitioner}</span>}
        <h2>{planned.title}</h2>
        <p className="hero-desc">{planned.description}</p>
        {tip && (
          <p className="hero-tip">
            <Sparkles size={13} /> <span title={tip.body}>{tip.body}</span>
          </p>
        )}
        <button className="hero-disclose" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Other options · ~{planned.prepMinutes} min prep <ChevronDown size={14} className={open ? 'rot' : ''} />
        </button>
        {open && (
          <ul className="hero-examples">
            {planned.examples.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="hero-actions">
          <button className="btn btn-hero" onClick={quickLog} disabled={quick.pending}>
            {quick.pending ? <Spinner /> : <Check size={16} />} Had it
          </button>
          <button className="btn btn-hero-ghost" onClick={onOpen}>
            Something changed
          </button>
        </div>
      </section>
    );
  }

  return (
    <li className={`day-row ${log ? `is-logged logged-${log.status}` : ''}`}>
      <span className="day-time">{formatClock(planned.time).replace(' ', '\u00a0')}</span>
      <button className="day-main" onClick={onOpen} aria-label={log ? `Edit ${planned.label} log` : `Log ${planned.label}`}>
        <span className="meal-label">
          {planned.label}
          {updated && <span className="tag-updated">Updated by {practitioner}</span>}
        </span>
        <strong>{log?.substitute ? log.substitute : planned.title}</strong>
        {log && (
          <span className="day-status">
            <StatusIcon state={log.status} size={12} /> {CLIENT_STATUS_LABEL[log.status]}
          </span>
        )}
      </button>
      {log ? (
        <Pencil size={14} className="day-edit" aria-hidden />
      ) : (
        <button className="day-check" onClick={quickLog} disabled={quick.pending} aria-label={`Had ${planned.label} as planned`}>
          {quick.pending ? <Spinner /> : <Check size={16} />}
        </button>
      )}
    </li>
  );
}
