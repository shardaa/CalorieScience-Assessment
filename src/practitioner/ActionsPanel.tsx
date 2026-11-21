import { Activity, NotebookPen, Send, Utensils, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDb, useMutation, useNow } from '../data/hooks';
import { currentPlan } from '../domain/adherence';
import { addNote, applyAdjustment, discardAdjustment, proposeAdjustment, sendRecommendation } from '../domain/commands';
import type { Analysis } from '../domain/insights';
import { SLOT_LABEL } from '../domain/labels';
import { formatClock, relativeTime } from '../domain/time';
import type { MealSlot, PlanAdjustment, PlannedMeal } from '../domain/types';
import { SLOTS } from '../domain/types';
import { EmptyState, Spinner } from '../ui/kit';
import type { ActionDraft, ActionTab } from './ClientDetail';

/** Starting points the practitioner edits — never sent without review. */
const SUGGESTED: Partial<Record<MealSlot, { change: Partial<PlannedMeal>; rationale: string; message: (first: string) => string }>> = {
  snack: {
    change: {
      title: 'Portable protein snack',
      description: 'No-prep options to keep at your desk: roasted chana pouch, a Greek yoghurt cup, or a handful of almonds with a fruit. Any time 4–6 PM.',
      examples: ['Roasted chana pouch', 'Greek yoghurt cup', 'Almonds + apple', 'Paneer cubes in a box'],
      prepMinutes: 0,
    },
    rationale: 'Snack skipped on most workdays; client reports no time to prepare or eat at work. Switching to no-prep, portable options.',
    message: (n) =>
      `Hi ${n}, thanks for telling me about the afternoon snack. That really helps. I've changed it to no-prep options you can keep at your desk (roasted chana, yoghurt cup, nuts + fruit). Anytime between 4 and 6 PM is fine. Let me know how this week goes.`,
  },
  lunch: {
    change: {
      title: 'Office-friendly balanced lunch',
      description: 'Pack a tiffin when you can. At the cafeteria: dal + sabzi + 1–2 rotis + salad, and skip fried sides.',
      examples: ['Tiffin: rajma + rice + salad', 'Cafeteria: dal, sabzi, roti, curd'],
    },
    rationale: 'Lunch frequently substituted on workdays due to meetings. Adding guidance for workplace options instead of home-style only.',
    message: (n) => `Hi ${n}, workday lunches look tricky with meetings. I've added simple guidance for choosing at the cafeteria so it still counts as on-plan.`,
  },
  dinner: {
    change: { time: '21:00', description: 'Lighter, quick-to-make dinner on late workdays: dal khichdi with vegetables, or an omelette with sautéed greens.' },
    rationale: 'Dinner timing regularly 60–135 min later than planned on workdays.',
    message: (n) => `Hi ${n}, I've moved dinner to a more realistic time and added a quicker option for late days.`,
  },
};

export function ActionsPanel({ clientId, draft, a }: { clientId: string; draft: ActionDraft; a: Analysis }) {
  const [tab, setTab] = useState<ActionTab>(draft.tab);
  useEffect(() => setTab(draft.tab), [draft.nonce, draft.tab]);
  const db = useDb();
  const pending = db.adjustments.filter((x) => x.clientId === clientId && x.status === 'proposed').length;

  return (
    <section className="panel actions" aria-labelledby="act-title">
      <header className="panel-head">
        <h2 id="act-title">Take action</h2>
      </header>
      <div className="seg-tabs" role="tablist">
        {(
          [
            ['message', 'Message client', Send],
            ['adjust', 'Plan change', Utensils],
            ['note', 'Private note', NotebookPen],
          ] as const
        ).map(([k, label, Icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>
            <Icon size={13} /> {label}
            {k === 'adjust' && pending > 0 && <span className="chip-count">{pending}</span>}
          </button>
        ))}
      </div>
      {tab === 'message' && <MessageForm key={`m${draft.nonce}`} clientId={clientId} draft={draft} />}
      {tab === 'adjust' && <AdjustForm key={`a${draft.nonce}`} clientId={clientId} draft={draft} a={a} />}
      {tab === 'note' && <NoteForm clientId={clientId} />}
    </section>
  );
}

function MessageForm({ clientId, draft }: { clientId: string; draft: ActionDraft }) {
  const db = useDb();
  const now = useNow();
  const client = db.clients.find((c) => c.id === clientId)!;
  const first = client.name.split(' ')[0];
  const replyTo = draft.replyTo ? db.messages.find((m) => m.id === draft.replyTo) : undefined;
  const [slot, setSlot] = useState<MealSlot | ''>(draft.slot ?? '');
  const [body, setBody] = useState('');
  const m = useMutation();
  const sent = db.messages.filter((x) => x.clientId === clientId && x.author === 'practitioner').sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
  const suggestion = slot ? SUGGESTED[slot]?.message(first) : undefined;

  return (
    <div className="form">
      {replyTo && <p className="replying">Replying to: “{replyTo.body}”</p>}
      <label className="field">
        <span>About a meal (shows on that meal in the client's Today screen)</span>
        <select value={slot} onChange={(e) => setSlot(e.target.value as MealSlot | '')}>
          <option value="">General</option>
          {SLOTS.map((s) => (
            <option key={s} value={s}>
              {SLOT_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Message to {first}</span>
        <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Supportive, specific, one thing to try" />
      </label>
      {suggestion && !body && (
        <button className="link-btn" onClick={() => setBody(suggestion)}>
          <Wand2 size={12} /> Start from suggested wording
        </button>
      )}
      {m.error && <p className="form-error">{m.error}</p>}
      <button
        className="btn btn-primary"
        disabled={m.pending || !body.trim()}
        onClick={async () => {
          if (await m.run((d, n) => sendRecommendation(d, { clientId, body, slot: slot || undefined, inReplyTo: replyTo?.id }, n), { success: `Sent to ${first}'s Companion app` })) setBody('');
        }}
      >
        {m.pending ? <Spinner /> : <Send size={14} />} Send to Companion app
      </button>
      {sent.length > 0 && (
        <ul className="sent-list">
          {sent.slice(0, 4).map((s) => (
            <li key={s.id}>
              <span className="sent-body">{s.body}</span>
              <span className="muted small">
                {relativeTime(s.createdAt, now)} · {s.seenByClientAt ? `read ${relativeTime(s.seenByClientAt, now)}` : 'not read yet'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdjustForm({ clientId, draft, a }: { clientId: string; draft: ActionDraft; a: Analysis }) {
  const db = useDb();
  const now = useNow();
  const plan = currentPlan(db, clientId, now);
  const [slot, setSlot] = useState<MealSlot>(draft.slot ?? 'snack');
  const meal = plan?.meals.find((x) => x.slot === slot);
  const defaultBasis = draft.basedOn ?? a.observations.find((o) => o.slot === slot && o.tone === 'concern')?.text ?? '';
  const [basedOn, setBasedOn] = useState(defaultBasis);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [description, setDescription] = useState('');
  const [rationale, setRationale] = useState('');
  const m = useMutation();
  const adjustments = db.adjustments.filter((x) => x.clientId === clientId);
  const sug = SUGGESTED[slot];

  useEffect(() => {
    if (!draft.basedOn) setBasedOn(a.observations.find((o) => o.slot === slot && o.tone === 'concern')?.text ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);

  const useSuggestion = () => {
    if (!sug) return;
    setTitle(sug.change.title ?? '');
    setTime(sug.change.time ?? '');
    setDescription(sug.change.description ?? '');
    setRationale(sug.rationale);
  };

  const submit = async () => {
    const change: PlanAdjustment['change'] = {
      title: title.trim() || undefined,
      time: time || undefined,
      description: description.trim() || undefined,
    };
    if (sug && title === sug.change.title) {
      change.examples = sug.change.examples;
      change.prepMinutes = sug.change.prepMinutes;
    }
    const ok = await m.run((d, n) => proposeAdjustment(d, { clientId, slot, basedOn: basedOn || 'Practitioner judgement', change, rationale }, n), { success: 'Adjustment recorded as proposed' });
    if (ok) {
      setTitle('');
      setTime('');
      setDescription('');
      setRationale('');
    }
  };

  if (!plan) return <EmptyState icon={<Utensils size={22} />} title="No active plan" />;

  return (
    <div className="form">
      <label className="field">
        <span>Meal</span>
        <select value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>
          {SLOTS.map((s) => (
            <option key={s} value={s}>
              {SLOT_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      {meal && (
        <p className="current">
          Current (v{plan.version}): <strong>{meal.title}</strong> · {formatClock(meal.time)} · ~{meal.prepMinutes} min prep
        </p>
      )}
      {basedOn && <p className="basis">Based on: {basedOn}</p>}
      {sug && !title && (
        <button className="link-btn" onClick={useSuggestion}>
          <Wand2 size={12} /> Start from a suggested adjustment
        </button>
      )}
      <div className="field-pair">
        <label className="field">
          <span>New meal title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={meal?.title} />
        </label>
        <label className="field field-narrow">
          <span>New time</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>New description</span>
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={meal?.description} />
      </label>
      <label className="field">
        <span>Rationale (kept in plan history)</span>
        <textarea rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} />
      </label>
      {m.error && <p className="form-error">{m.error}</p>}
      <button className="btn btn-ghost" disabled={m.pending} onClick={submit}>
        {m.pending && <Spinner />} Record proposed adjustment
      </button>

      {adjustments.length > 0 && (
        <ul className="adj-list">
          {adjustments.map((adj) => (
            <AdjustmentItem key={adj.id} adj={adj} first={db.clients.find((c) => c.id === clientId)!.name.split(' ')[0]} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AdjustmentItem({ adj, first }: { adj: PlanAdjustment; first: string }) {
  const now = useNow();
  const m = useMutation();
  const [msg, setMsg] = useState(SUGGESTED[adj.slot]?.message(first) ?? `Hi ${first}, I've updated your ${SLOT_LABEL[adj.slot].toLowerCase()} based on what you've told me.`);
  return (
    <li className={`adj adj-${adj.status}`}>
      <div className="adj-head">
        <strong>{SLOT_LABEL[adj.slot]}</strong>
        <span className={`adj-status s-${adj.status}`}>{adj.status === 'applied' ? `Applied · v${adj.appliedPlanVersion}` : adj.status}</span>
        <span className="muted small">{relativeTime(adj.resolvedAt ?? adj.createdAt, now)}</span>
      </div>
      <ul className="adj-change">
        {adj.change.title && <li>Title → {adj.change.title}</li>}
        {adj.change.time && <li>Time → {formatClock(adj.change.time)}</li>}
        {adj.change.description && <li>Description → {adj.change.description}</li>}
      </ul>
      <p className="muted small">Why: {adj.rationale}</p>
      {adj.status === 'proposed' && (
        <>
          <label className="field">
            <span>Message sent with the update (optional)</span>
            <textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} />
          </label>
          {m.error && <p className="form-error">{m.error}</p>}
          <div className="btn-row">
            <button className="btn btn-primary" disabled={m.pending} onClick={() => m.run((d, n) => applyAdjustment(d, adj.id, msg, n), { success: `Plan updated. ${first} will see it in the Companion app.` })}>
              {m.pending && <Spinner />} Apply to plan & notify
            </button>
            <button className="btn btn-ghost" disabled={m.pending} onClick={() => m.run((d, n) => discardAdjustment(d, adj.id, n))}>
              Discard
            </button>
          </div>
        </>
      )}
    </li>
  );
}

function NoteForm({ clientId }: { clientId: string }) {
  const db = useDb();
  const now = useNow();
  const [body, setBody] = useState('');
  const m = useMutation();
  const notes = db.notes.filter((n) => n.clientId === clientId);
  return (
    <div className="form">
      <label className="field">
        <span>Only visible to you and your practice team</span>
        <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. Discuss workday schedule at next session; consider desk-friendly snacks." />
      </label>
      {m.error && <p className="form-error">{m.error}</p>}
      <button
        className="btn btn-primary"
        disabled={m.pending || !body.trim()}
        onClick={async () => {
          if (await m.run((d, n) => addNote(d, { clientId, body }, n), { success: 'Note saved' })) setBody('');
        }}
      >
        {m.pending ? <Spinner /> : <NotebookPen size={14} />} Save note
      </button>
      {notes.length > 0 && (
        <ul className="sent-list">
          {notes.map((n) => (
            <li key={n.id}>
              <span className="sent-body">{n.body}</span>
              <span className="muted small">{relativeTime(n.createdAt, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ActivityPanel({ clientId }: { clientId: string }) {
  const db = useDb();
  const now = useNow();
  const events = db.activity.filter((e) => e.clientId === clientId).slice(0, 8);
  return (
    <section className="panel" aria-labelledby="activity-title">
      <header className="panel-head">
        <h2 id="activity-title">
          <Activity size={16} /> Recent activity
        </h2>
      </header>
      {events.length === 0 ? (
        <p className="muted small">Actions by you and the client will appear here as they happen.</p>
      ) : (
        <ol className="timeline">
          {events.map((e) => (
            <li key={e.id} className={`tl tl-${e.actor}`}>
              <span className="tl-actor">{e.actor === 'client' ? 'Client' : 'You'}</span>
              <span>{e.summary}</span>
              <span className="muted small">{relativeTime(e.at, now)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
