import { Activity, ChevronLeft, ClipboardCheck, Flag, Info, LayoutGrid, MessageSquare, NotebookPen, Pencil, Send, Sparkles, Utensils, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useDb, useLoad, useMutation, useNow } from '../data/hooks';
import { currentPlan, pct } from '../domain/adherence';
import { markReviewed, setFlag } from '../domain/commands';
import { analyse, type Analysis } from '../domain/insights';
import { SLOT_LABEL } from '../domain/labels';
import { daysBetween, formatClock, formatDay, relativeTime, toDateKey } from '../domain/time';
import type { MealSlot } from '../domain/types';
import { Avatar, ErrorState, Skeleton, SkeletonList, Spinner } from '../ui/kit';
import { ActionsPanel, ActivityPanel } from './ActionsPanel';
import { FeedbackPanel } from './FeedbackPanel';
import { InsightPanel } from './InsightPanel';
import { PlanEditor } from './PlanEditor';
import { WeeklyPattern } from './WeeklyPattern';

export type ActionTab = 'message' | 'adjust' | 'note';
export type DetailTab = 'overview' | 'feedback' | 'plan' | 'activity';
export interface ActionDraft {
  tab: ActionTab;
  slot?: MealSlot;
  basedOn?: string;
  replyTo?: string;
  nonce: number;
}

export function ClientDetail({
  clientId,
  tab,
  onTab,
  backLabel,
  onBack,
}: {
  clientId: string;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  backLabel: string;
  onBack: () => void;
}) {
  const db = useDb();
  const now = useNow();
  const load = useLoad(`detail:${clientId}`);
  const client = db.clients.find((c) => c.id === clientId);
  const a = useMemo(() => analyse(db, clientId, now), [db, clientId, now]);
  const cs = db.caseStates.find((c) => c.clientId === clientId);
  const plan = currentPlan(db, clientId, now);
  const [draft, setDraft] = useState<ActionDraft | null>(null);
  const review = useMutation();
  const flag = useMutation();
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('');

  const act = (d: Omit<ActionDraft, 'nonce'>) => setDraft({ ...d, nonce: Date.now() });

  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDraft(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft]);

  if (load.status === 'loading')
    return (
      <div className="pr-page stack">
        <Skeleton h={28} w={260} />
        <Skeleton h={150} r={16} />
        <SkeletonList rows={3} h={140} />
      </div>
    );
  if (load.status === 'error' || !client)
    return (
      <div className="pr-page">
        <button className="back" onClick={onBack}>
          <ChevronLeft size={15} /> {backLabel}
        </button>
        {load.status === 'error' ? <ErrorState message={load.message} onRetry={load.retry} /> : <ErrorState message="This client could not be found." onRetry={onBack} />}
      </div>
    );

  const first = client.name.split(' ')[0];
  const week = Math.min(client.programmeWeeks, Math.floor(daysBetween(client.programmeStart, toDateKey(now)) / 7) + 1);
  const newFeedback = a.openFeedback.filter((m) => m.status === 'new').length;
  const proposed = db.adjustments.filter((x) => x.clientId === clientId && x.status === 'proposed').length;

  const TABS: [DetailTab, string, typeof LayoutGrid, number][] = [
    ['overview', 'Overview', LayoutGrid, 0],
    ['feedback', 'Feedback', MessageSquare, newFeedback],
    ['plan', 'Meal plan', Utensils, proposed],
    ['activity', 'Notes & activity', Activity, 0],
  ];

  return (
    <div className="workspace">
      <header className="ws-head">
        <button className="back" onClick={onBack}>
          <ChevronLeft size={15} /> {backLabel}
        </button>
        <div className="ws-title">
          <div className="who who-lg">
            <Avatar name={client.name} hue={client.avatarHue} size={52} />
            <div>
              <h1>{client.name}</h1>
              <p className="ws-meta">
                <span>{client.age}</span>
                <span>{client.occupation}</span>
                <span>
                  Week {week} of {client.programmeWeeks}
                </span>
                <span>{plan ? `Plan v${plan.version}` : 'No plan yet'}</span>
                <span className="ws-email">{client.email}</span>
              </p>
              <p className="goal">{client.goal}</p>
            </div>
          </div>
          <div className="detail-actions">
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => act({ tab: 'message' })}>
                <Send size={14} /> Message
              </button>
              {plan ? (
                <button className="btn btn-ghost" onClick={() => act({ tab: 'adjust' })}>
                  <Utensils size={14} /> Change a meal
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => onTab('plan')}>
                  <Utensils size={14} /> Create plan
                </button>
              )}
              {cs?.flag ? (
                <button className="btn btn-ghost" disabled={flag.pending} onClick={() => flag.run((d, n) => setFlag(d, clientId, null, n), { success: 'Flag cleared' })}>
                  {flag.pending ? <Spinner /> : <X size={14} />} Clear flag
                </button>
              ) : (
                <div className="popover-wrap">
                  <button className="btn btn-ghost" onClick={() => setFlagOpen((o) => !o)} aria-expanded={flagOpen}>
                    <Flag size={14} /> Flag
                  </button>
                  {flagOpen && (
                    <form
                      className="popover"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (await flag.run((d, n) => setFlag(d, clientId, flagReason || 'Follow up', n), { success: 'Flagged for follow-up' })) {
                          setFlagOpen(false);
                          setFlagReason('');
                        }
                      }}
                    >
                      <label className="field">
                        <span>Reason</span>
                        <input autoFocus value={flagReason} onChange={(e) => setFlagReason(e.target.value)} placeholder="e.g. Call re: afternoon snack" />
                      </label>
                      <div className="chip-row">
                        {['Call to discuss barriers', 'Check-in next session', 'Review plan'].map((r) => (
                          <button type="button" key={r} className="chip" onClick={() => setFlagReason(r)}>
                            {r}
                          </button>
                        ))}
                      </div>
                      <button className="btn btn-primary" disabled={flag.pending}>
                        {flag.pending && <Spinner />} Flag for follow-up
                      </button>
                    </form>
                  )}
                </div>
              )}
              <button
                className="btn btn-primary"
                disabled={review.pending || !a.newSinceReview}
                onClick={() => review.run((d, n) => markReviewed(d, clientId, n), { success: `${first} marked as reviewed` })}
                title={a.newSinceReview ? 'Marks new logs and feedback as seen' : 'Nothing new since your last review'}
              >
                {review.pending ? <Spinner /> : <ClipboardCheck size={14} />} {a.newSinceReview ? 'Mark week reviewed' : 'Reviewed'}
              </button>
            </div>
            <div className="status-line">
              {cs?.flag && (
                <span className="trigger trigger-high">
                  <Flag size={11} /> {cs.flag.reason}
                </span>
              )}
              <span className="muted">
                {cs?.lastReviewedAt ? `Last reviewed ${relativeTime(cs.lastReviewedAt, now)}` : 'Never reviewed'}
                {a.newSinceReview && cs?.lastReviewedAt ? ' · new data since' : ''}
              </span>
            </div>
          </div>
        </div>
        <nav className="ws-tabs" role="tablist" aria-label={`${first}'s record`}>
          {TABS.map(([k, label, Icon, n]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => onTab(k)}>
              <Icon size={15} /> {label}
              {n > 0 && <span className="tab-count">{n}</span>}
            </button>
          ))}
        </nav>
      </header>

      <div className="pr-page ws-page enter" key={tab}>
        {tab === 'overview' && (
          <>
            <SummaryBand a={a} newFeedback={newFeedback} onFeedback={() => onTab('feedback')} />
            <WeeklyPattern a={a} clientId={clientId} />
            <InsightPanel a={a} onAct={act} />
          </>
        )}
        {tab === 'feedback' && <FeedbackPanel a={a} clientId={clientId} onReply={(m) => act({ tab: 'message', slot: m.slot, replyTo: m.id })} />}
        {tab === 'plan' && <PlanView clientId={clientId} onChange={(slot) => act({ tab: 'adjust', slot })} />}
        {tab === 'activity' && (
          <div className="ws-split">
            <ActivityPanel clientId={clientId} />
            <NotesPanel clientId={clientId} onAdd={() => act({ tab: 'note' })} />
          </div>
        )}
      </div>

      {draft && (
        <div className="drawer-backdrop" onClick={() => setDraft(null)}>
          <aside className="drawer" role="dialog" aria-modal="true" aria-label={`Act for ${first}`} onClick={(e) => e.stopPropagation()}>
            <header className="drawer-head">
              <div className="who">
                <Avatar name={client.name} hue={client.avatarHue} size={32} />
                <span>
                  <strong>{client.name}</strong>
                  <small>Changes reach {first}'s Companion app</small>
                </span>
              </div>
              <button className="icon-btn" onClick={() => setDraft(null)} aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <div className="drawer-body">
              <ActionsPanel clientId={clientId} draft={draft} a={a} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/** The one-paragraph read of the week, with the two adherence numbers kept apart. */
function SummaryBand({ a, newFeedback, onFeedback }: { a: Analysis; newFeedback: number; onFeedback: () => void }) {
  const s = a.summary;
  return (
    <section className="summary-band" aria-labelledby="summary-title">
      <div className="summary-text">
        <p className="eyebrow" id="summary-title">
          <Sparkles size={13} /> This week in one paragraph · {formatDay(a.window[0], { day: 'numeric', month: 'short' })} – {formatDay(a.window[6], { day: 'numeric', month: 'short' })}
        </p>
        <p className="headline">{a.headline}</p>
        <p className="disclaimer">
          <Info size={12} /> Built from client-reported logs and messages by fixed rules. It describes patterns and makes no clinical judgement.
        </p>
      </div>
      <dl className="summary-stats">
        <div>
          <dt>Logged</dt>
          <dd className={s.completeness !== null && s.completeness < 0.6 ? 'warn' : ''}>
            {s.logged}
            <span>/{s.due}</span>
          </dd>
          <p>{pct(s.completeness)} of planned meals have a log</p>
        </div>
        <div>
          <dt>Plan alignment</dt>
          <dd>{pct(s.alignment)}</dd>
          <p>{s.logged ? `of ${s.logged} logged meals; partial and swapped count half` : 'Nothing logged yet'}</p>
        </div>
        <div>
          <dt>Client feedback</dt>
          <dd className={newFeedback ? 'accent' : ''}>{newFeedback ? `${newFeedback} new` : '0'}</dd>
          {newFeedback ? (
            <button className="band-link" onClick={onFeedback}>
              Read it →
            </button>
          ) : (
            <p>Nothing waiting for you</p>
          )}
        </div>
      </dl>
    </section>
  );
}

/** The current plan as the client sees it, plus its version history. No plan yet → the plan builder. */
function PlanView({ clientId, onChange }: { clientId: string; onChange: (slot: MealSlot) => void }) {
  const db = useDb();
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const plan = currentPlan(db, clientId, now);
  const versions = db.plans.filter((p) => p.clientId === clientId).sort((x, y) => y.version - x.version);
  const proposed = db.adjustments.filter((x) => x.clientId === clientId && x.status === 'proposed');
  if (!plan) return <PlanEditor clientId={clientId} onDone={() => setEditing(false)} />;
  if (editing) return <PlanEditor clientId={clientId} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />;
  return (
    <div className="ws-split ws-split-wide">
      <section className="panel" aria-labelledby="plan-title">
        <header className="panel-head">
          <h2 id="plan-title">Current plan · v{plan.version}</h2>
          <button className="mini-btn" onClick={() => setEditing(true)}>
            <Pencil size={12} /> Edit whole plan
          </button>
        </header>
        <ul className="plan-meals">
          {plan.meals.map((m) => (
            <li key={m.slot} className="plan-meal">
              <span className="plan-time">{formatClock(m.time)}</span>
              <div>
                <p className="meal-label">
                  {SLOT_LABEL[m.slot]}
                  {plan.changedSlots?.includes(m.slot) && <span className="tag-updated">Changed in v{plan.version}</span>}
                  {proposed.some((p) => p.slot === m.slot) && <span className="tag-proposed">Change proposed</span>}
                </p>
                <h3>{m.title}</h3>
                <p className="muted small">
                  {m.description} · ~{m.prepMinutes} min prep
                </p>
              </div>
              <button className="mini-btn" onClick={() => onChange(m.slot)}>
                Change
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel" aria-labelledby="versions-title">
        <header className="panel-head">
          <h2 id="versions-title">Versions</h2>
          <span className="panel-meta">Since {formatDay(plan.effectiveFrom, { day: 'numeric', month: 'short' })}</span>
        </header>
        <ol className="versions">
          {versions.map((v) => (
            <li key={v.id} className={v.id === plan.id ? 'is-current' : ''}>
              <strong>v{v.version}</strong>
              <span>
                From {formatDay(v.effectiveFrom, { day: 'numeric', month: 'short' })}
                {v.changedSlots?.length ? ` · ${v.changedSlots.map((s) => SLOT_LABEL[s]).join(', ')} changed` : ' · first plan'}
              </span>
            </li>
          ))}
        </ol>
        <p className="muted small">Past logs keep the version they were logged against, so changing the plan never rewrites history.</p>
      </section>
    </div>
  );
}

function NotesPanel({ clientId, onAdd }: { clientId: string; onAdd: () => void }) {
  const db = useDb();
  const now = useNow();
  const notes = db.notes.filter((n) => n.clientId === clientId);
  return (
    <section className="panel" aria-labelledby="notes-title">
      <header className="panel-head">
        <h2 id="notes-title">
          <NotebookPen size={16} /> Private notes
        </h2>
        <button className="mini-btn" onClick={onAdd}>
          Add note
        </button>
      </header>
      {notes.length === 0 ? (
        <p className="muted small">Only you and your practice team see these.</p>
      ) : (
        <ul className="sent-list">
          {notes.map((n) => (
            <li key={n.id}>
              <span className="sent-body">{n.body}</span>
              <span className="muted small">{relativeTime(n.createdAt, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
