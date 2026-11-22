import { Check, ChevronDown, Clock, Pencil, Sparkles } from 'lucide-react';
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
      <header className="client-header">
        <p className="eyebrow">
          {formatLongDate(today)} · Week {week} of {client.programmeWeeks}
        </p>
        <h1>
          {greeting(now)}, {client.name.split(' ')[0]}
        </h1>
      </header>

      {unseen.map((m) => (
        <PractitionerCard key={m.id} message={m} from={db.practitioner.name} />
      ))}

      <section className="today-progress" aria-label="Today's logging progress">
        <div className="segments">
          {cells.map((c) => (
            <span key={c.slot} className={`seg ${c.log ? 'seg-done' : c.due ? 'seg-due' : ''}`} title={c.planned.label} />
          ))}
        </div>
        <p>
          <strong>
            {logged} of {cells.length}
          </strong>{' '}
          meals logged today
          {logged === cells.length ? '. Complete picture, thank you!' : cells.some((c) => c.due && !c.log) ? '. One or two are waiting for a quick check-in.' : ''}
        </p>
      </section>

      <ol className="meal-list">
        {cells.map((c) => (
          <MealCard
            key={c.slot}
            cell={c}
            clientId={client.id}
            upNext={upNext?.slot === c.slot}
            updated={!!isUpdated(c)}
            tip={tipFor(c.slot)}
            practitioner={practitioner}
            onOpen={() => setSheet(c)}
          />
        ))}
      </ol>

      <button className="link-btn center" onClick={() => onTell({})}>
        Something not working with your plan? Tell {practitioner} →
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
  upNext,
  updated,
  tip,
  practitioner,
  onOpen,
}: {
  cell: Cell;
  clientId: string;
  upNext: boolean;
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

  if (log) {
    return (
      <li className={`meal-card meal-logged logged-${log.status}`}>
        <span className="meal-node" aria-hidden>
          <StatusIcon state={log.status} size={12} />
        </span>
        <button className="logged-row" onClick={onOpen} aria-label={`Edit ${planned.label} log`}>
          <span className="logged-text">
            <span className="meal-label">
              {formatClock(planned.time)} · {planned.label}
            </span>
            <strong>{log.substitute ? log.substitute : planned.title}</strong>
            <span className="logged-status">{CLIENT_STATUS_LABEL[log.status]}</span>
          </span>
          <Pencil size={14} className="muted" />
        </button>
      </li>
    );
  }

  return (
    <li className={`meal-card ${upNext ? 'meal-next' : ''}`}>
      <span className="meal-node" aria-hidden />
      <div className="meal-main">
        <div className="meal-head">
          <span className="meal-label">
            {formatClock(planned.time)} · {planned.label}
          </span>
          {upNext && <span className="next-tag">Up next</span>}
          {updated && <span className="tag-updated">Updated by {practitioner}</span>}
        </div>
        <h3>{planned.title}</h3>
        <p className="meal-desc">{planned.description}</p>
        {tip && (
          <p className="meal-tip">
            <Sparkles size={12} /> <span title={tip.body}>{tip.body}</span>
          </p>
        )}
        <button className="disclose" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Other options · ~{planned.prepMinutes} min prep <ChevronDown size={14} className={open ? 'rot' : ''} />
        </button>
        {open && (
          <ul className="examples">
            {planned.examples.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="log-actions">
          <button className="btn btn-primary" onClick={quickLog} disabled={quick.pending}>
            {quick.pending ? <Spinner /> : <Check size={15} />} Had it
          </button>
          <button className="btn btn-ghost" onClick={onOpen}>
            Something changed
          </button>
        </div>
      </div>
    </li>
  );
}
