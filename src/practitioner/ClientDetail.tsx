import { ChevronLeft, ClipboardCheck, Flag, Info, Sparkles, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useDb, useLoad, useMutation, useNow } from '../data/hooks';
import { currentPlan, pct } from '../domain/adherence';
import { markReviewed, setFlag } from '../domain/commands';
import { analyse, type Analysis } from '../domain/insights';
import { daysBetween, formatDay, relativeTime, toDateKey } from '../domain/time';
import type { MealSlot } from '../domain/types';
import { Avatar, ErrorState, Skeleton, SkeletonList, Spinner } from '../ui/kit';
import { ActionsPanel, ActivityPanel } from './ActionsPanel';
import { FeedbackPanel } from './FeedbackPanel';
import { InsightPanel } from './InsightPanel';
import { WeeklyPattern } from './WeeklyPattern';

export type ActionTab = 'message' | 'adjust' | 'note';
export interface ActionDraft {
  tab: ActionTab;
  slot?: MealSlot;
  basedOn?: string;
  replyTo?: string;
  nonce: number;
}

export function ClientDetail({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const db = useDb();
  const now = useNow();
  const load = useLoad(`detail:${clientId}`);
  const client = db.clients.find((c) => c.id === clientId);
  const a = useMemo(() => analyse(db, clientId, now), [db, clientId, now]);
  const cs = db.caseStates.find((c) => c.clientId === clientId);
  const plan = currentPlan(db, clientId, now);
  const [draft, setDraft] = useState<ActionDraft>({ tab: 'message', nonce: 0 });
  const actionsRef = useRef<HTMLDivElement>(null);
  const review = useMutation();
  const flag = useMutation();
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('');

  const act = (d: Omit<ActionDraft, 'nonce'>) => {
    setDraft({ ...d, nonce: Date.now() });
    actionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (load.status === 'loading')
    return (
      <div className="pr-page stack">
        <Skeleton h={28} w={260} />
        <Skeleton h={120} r={16} />
        <SkeletonList rows={3} h={140} />
      </div>
    );
  if (load.status === 'error' || !client)
    return (
      <div className="pr-page">
        <button className="back" onClick={onBack}>
          <ChevronLeft size={15} /> Caseload
        </button>
        {load.status === 'error' ? <ErrorState message={load.message} onRetry={load.retry} /> : <ErrorState message="This client could not be found." onRetry={onBack} />}
      </div>
    );

  const week = Math.min(client.programmeWeeks, Math.floor(daysBetween(client.programmeStart, toDateKey(now)) / 7) + 1);

  return (
    <div className="pr-page enter">
      <button className="back" onClick={onBack}>
        <ChevronLeft size={15} /> Caseload
      </button>

      <header className="detail-head">
        <div className="who who-lg">
          <Avatar name={client.name} hue={client.avatarHue} size={48} />
          <div>
            <h1>{client.name}</h1>
            <p className="muted">
              {client.age} · {client.occupation} · Week {week} of {client.programmeWeeks} · Plan v{plan?.version ?? '–'}
            </p>
            <p className="goal">Goal: {client.goal}</p>
          </div>
        </div>
        <div className="detail-actions">
          <div className="status-line">
            {cs?.flag && (
              <span className="trigger trigger-high">
                <Flag size={11} /> {cs.flag.reason}
              </span>
            )}
            <span className="muted small">
              {cs?.lastReviewedAt ? `Last reviewed ${relativeTime(cs.lastReviewedAt, now)}` : 'Never reviewed'}
              {a.newSinceReview && cs?.lastReviewedAt ? ' · new data since' : ''}
            </span>
          </div>
          <div className="btn-row">
            {cs?.flag ? (
              <button className="btn btn-ghost" disabled={flag.pending} onClick={() => flag.run((d, n) => setFlag(d, clientId, null, n), { success: 'Flag cleared' })}>
                {flag.pending ? <Spinner /> : <X size={14} />} Clear flag
              </button>
            ) : (
              <div className="popover-wrap">
                <button className="btn btn-ghost" onClick={() => setFlagOpen((o) => !o)} aria-expanded={flagOpen}>
                  <Flag size={14} /> Flag for follow-up
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
                      {flag.pending && <Spinner />} Flag
                    </button>
                  </form>
                )}
              </div>
            )}
            <button
              className="btn btn-primary"
              disabled={review.pending || !a.newSinceReview}
              onClick={() => review.run((d, n) => markReviewed(d, clientId, n), { success: `${client.name.split(' ')[0]} marked as reviewed` })}
              title={a.newSinceReview ? 'Marks new logs and feedback as seen' : 'Nothing new since your last review'}
            >
              {review.pending ? <Spinner /> : <ClipboardCheck size={14} />} {a.newSinceReview ? 'Mark week reviewed' : 'Reviewed'}
            </button>
          </div>
        </div>
      </header>

      <SummaryBand a={a} newFeedback={a.openFeedback.filter((m) => m.status === 'new').length} />

      <div className="detail-grid">
        {/* `order` interleaves the two columns when they collapse to one: pattern → findings → feedback → actions → activity. */}
        <div className="detail-main">
          <div style={{ order: 1 }}>
            <WeeklyPattern a={a} clientId={clientId} />
          </div>
          <div style={{ order: 2 }}>
            <InsightPanel a={a} onAct={act} />
          </div>
        </div>
        <aside className="detail-side">
          <div style={{ order: 3 }}>
            <FeedbackPanel a={a} clientId={clientId} onReply={(m) => act({ tab: 'message', slot: m.slot, replyTo: m.id })} />
          </div>
          <div style={{ order: 4, scrollMarginTop: 12 }} ref={actionsRef}>
            <ActionsPanel clientId={clientId} draft={draft} a={a} />
          </div>
          <div style={{ order: 5 }}>
            <ActivityPanel clientId={clientId} />
          </div>
        </aside>
      </div>
    </div>
  );
}

/** The one-paragraph read of the week, with the two adherence numbers kept apart. */
function SummaryBand({ a, newFeedback }: { a: Analysis; newFeedback: number }) {
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
          <p>{newFeedback ? 'Unread message from the client' : 'Nothing waiting for you'}</p>
        </div>
      </dl>
    </section>
  );
}
