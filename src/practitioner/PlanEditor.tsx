import { Send } from 'lucide-react';
import { useState } from 'react';
import { useDb, useMutation, useNow } from '../data/hooks';
import { currentPlan } from '../domain/adherence';
import { publishPlan } from '../domain/commands';
import { SLOT_LABEL } from '../domain/labels';
import { GENERIC_MEALS } from '../domain/seed';
import type { PlannedMeal } from '../domain/types';
import { Spinner } from '../ui/kit';

type Row = Omit<PlannedMeal, 'examples' | 'prepMinutes'> & { examples: string; prepMinutes: string };

const toRow = (m: PlannedMeal): Row => ({ ...m, examples: m.examples.join(', '), prepMinutes: String(m.prepMinutes) });

/**
 * The whole plan on one screen: four meals, each with a time, a name, what to eat,
 * the alternatives the client may pick from, and how long it takes to make.
 */
export function PlanEditor({ clientId, onDone, onCancel }: { clientId: string; onDone: () => void; onCancel?: () => void }) {
  const db = useDb();
  const now = useNow();
  const client = db.clients.find((c) => c.id === clientId)!;
  const first = client.name.split(' ')[0];
  const plan = currentPlan(db, clientId, now);
  const [rows, setRows] = useState<Row[]>(() => (plan?.meals ?? GENERIC_MEALS).map(toRow));
  const [message, setMessage] = useState('');
  const m = useMutation();

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const share = async () => {
    const meals: PlannedMeal[] = rows.map((r) => ({
      ...r,
      examples: r.examples.split(',').map((e) => e.trim()).filter(Boolean),
      prepMinutes: r.prepMinutes === '' ? NaN : Number(r.prepMinutes),
    }));
    const ok = await m.run((d, n) => publishPlan(d, { clientId, meals, message }, n), {
      success: plan ? `Plan v${plan.version + 1} shared with ${first}` : `Plan shared. ${first} can see it in the Companion app now.`,
    });
    if (ok) onDone();
  };

  return (
    <section className="panel plan-editor" aria-labelledby="pe-title">
      <header className="panel-head">
        <div>
          <h2 id="pe-title">{plan ? `Edit ${first}'s plan` : `Create ${first}'s meal plan`}</h2>
          <p className="muted small">
            {plan
              ? `Sharing creates v${plan.version + 1}, effective today. Past logs stay linked to the version they were logged against.`
              : `Start from the starter meals below and tailor them. ${first} sees the plan as soon as you share it.`}
          </p>
        </div>
      </header>

      <ol className="pe-meals">
        {rows.map((r, i) => (
          <li key={r.slot} className="pe-meal">
            <div className="pe-meal-head">
              <strong>{SLOT_LABEL[r.slot]}</strong>
              <label className="pe-time">
                <span className="sr-only">{SLOT_LABEL[r.slot]} time</span>
                <input type="time" value={r.time} onChange={(e) => set(i, { time: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>Meal</span>
              <input value={r.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="e.g. Moong dal chilla" />
            </label>
            <label className="field">
              <span>What to eat</span>
              <textarea rows={2} value={r.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="Portions, sides, anything to avoid" />
            </label>
            <div className="field-pair">
              <label className="field">
                <span>
                  Alternatives <em>comma-separated</em>
                </span>
                <input value={r.examples} onChange={(e) => set(i, { examples: e.target.value })} placeholder="e.g. Poha, Upma, Besan chilla" />
              </label>
              <label className="field field-narrow">
                <span>Prep (min)</span>
                <input type="number" inputMode="numeric" min={0} max={240} value={r.prepMinutes} onChange={(e) => set(i, { prepMinutes: e.target.value })} />
              </label>
            </div>
          </li>
        ))}
      </ol>

      <label className="field">
        <span>
          Note to {first} <em>optional</em>
        </span>
        <textarea
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={plan ? `Hi ${first}, I've updated your meal plan…` : `Hi ${first}, your meal plan is ready…`}
        />
      </label>

      {m.error && (
        <p className="form-error" role="alert">
          {m.error}
        </p>
      )}
      <div className="btn-row">
        <button className="btn btn-primary" onClick={share} disabled={m.pending}>
          {m.pending ? <Spinner /> : <Send size={14} />} {plan ? `Share v${plan.version + 1} with ${first}` : `Share plan with ${first}`}
        </button>
        {onCancel && (
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}
