import { Clock, Sparkles } from 'lucide-react';
import { useDb, useNow } from '../data/hooks';
import { buildCells, currentPlan } from '../domain/adherence';
import { daysBetween, formatClock, formatDay, toDateKey } from '../domain/time';
import type { Client } from '../domain/types';
import { EmptyState } from '../ui/kit';
import { Plate } from './TodayScreen';

/** The whole plan at a glance, with the alternatives the practitioner allows for each meal. */
export function PlanScreen({ client }: { client: Client }) {
  const db = useDb();
  const now = useNow();
  const today = toDateKey(now);
  const plan = currentPlan(db, client.id, now);
  const cells = buildCells(db, client.id, [today], now);
  const practitioner = db.practitioner.name.split(' ')[0];

  if (!plan)
    return (
      <div className="client-pad">
        <EmptyState icon={<Clock size={28} />} title="Your plan isn't ready yet">
          {practitioner} is preparing your meal plan.
        </EmptyState>
      </div>
    );

  const recent = plan.changedSlots?.length && daysBetween(plan.effectiveFrom, today) <= 7;

  return (
    <div className="client-pad enter">
      <header className="client-header">
        <h1>Meal plan</h1>
        <p className="hello-sub">
          From {practitioner} · version {plan.version} since {formatDay(plan.effectiveFrom, { day: 'numeric', month: 'short' })}
        </p>
      </header>
      {recent ? (
        <p className="plan-note">
          <Sparkles size={14} /> {practitioner} updated your plan recently. Changed meals are marked.
        </p>
      ) : null}
      <ul className="plan-cards">
        {cells.map((c) => (
          <li key={c.slot} className="plan-card">
            <Plate cell={{ ...c, log: undefined }} size="lg" />
            <div className="plan-card-main">
              <span className="meal-label">
                {c.planned.label} · {formatClock(c.planned.time)}
                {plan.changedSlots?.includes(c.slot) && recent ? <span className="tag-updated">Updated</span> : null}
              </span>
              <h3>{c.planned.title}</h3>
              <p className="muted small">{c.planned.description}</p>
              <p className="plan-prep">
                <Clock size={12} /> {c.planned.prepMinutes ? `~${c.planned.prepMinutes} min prep` : 'No prep'}
              </p>
              <div className="plan-alts">
                {c.planned.examples.map((e) => (
                  <span key={e}>{e}</span>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
