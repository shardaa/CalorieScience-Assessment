import { Check, CheckCheck, Inbox, MessageSquare, Reply } from 'lucide-react';
import { useDb, useMutation, useNow } from '../data/hooks';
import { setFeedbackStatus } from '../domain/commands';
import type { Analysis } from '../domain/insights';
import { REASON_LABEL, SLOT_LABEL, TOPIC_LABEL } from '../domain/labels';
import { formatDay, relativeTime } from '../domain/time';
import type { Message } from '../domain/types';
import { EmptyState, Spinner } from '../ui/kit';

const STATUS_RANK = { new: 0, acknowledged: 1, resolved: 2 } as const;

export function FeedbackPanel({ a, clientId, onReply }: { a: Analysis; clientId: string; onReply: (m: Message) => void }) {
  const db = useDb();
  const now = useNow();
  const feedback = db.messages
    .filter((m) => m.clientId === clientId && m.author === 'client')
    .sort((x, y) => STATUS_RANK[x.status ?? 'new'] - STATUS_RANK[y.status ?? 'new'] || (x.createdAt < y.createdAt ? 1 : -1));
  const maxBarrier = a.barriers[0]?.count ?? 1;
  const replies = (id: string) => db.messages.filter((m) => m.inReplyTo === id);

  return (
    <section className="panel" aria-labelledby="fb-title">
      <header className="panel-head">
        <h2 id="fb-title">
          <MessageSquare size={16} /> Client feedback & barriers
        </h2>
        {feedback.some((f) => f.status === 'new') && <span className="trigger trigger-high">{feedback.filter((f) => f.status === 'new').length} new</span>}
      </header>

      {feedback.length === 0 ? (
        <EmptyState icon={<Inbox size={22} />} title="No messages from this client" />
      ) : (
        <ul className="fb-list">
          {feedback.map((m) => (
            <FeedbackItem key={m.id} m={m} now={now} replies={replies(m.id)} onReply={() => onReply(m)} />
          ))}
        </ul>
      )}

      {a.barriers.length > 0 && (
        <div className="barriers">
          <h3 className="sub">Reasons given in logs (7 days)</h3>
          <ul>
            {a.barriers.slice(0, 5).map((b) => (
              <li key={b.reason}>
                <span className="b-label">{REASON_LABEL[b.reason]}</span>
                <span className="b-bar">
                  <span style={{ width: `${(b.count / maxBarrier) * 100}%` }} />
                </span>
                <span className="b-n">{b.count}</span>
                <span className="b-slots muted">
                  {Object.entries(b.slots)
                    .sort((x, y) => y[1]! - x[1]!)
                    .map(([s, n]) => `${SLOT_LABEL[s as keyof typeof SLOT_LABEL].replace('Afternoon ', '')} ${n}`)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {a.comments.length > 0 && (
        <div className="comments">
          <h3 className="sub">Comments on meal logs</h3>
          <ul>
            {a.comments.slice(0, 5).map((l) => (
              <li key={l.id}>
                <span className="muted small">
                  {formatDay(l.date)} · {SLOT_LABEL[l.slot]}
                </span>
                “{l.comment}”
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function FeedbackItem({ m, now, replies, onReply }: { m: Message; now: Date; replies: Message[]; onReply: () => void }) {
  const mut = useMutation();
  return (
    <li className={`fb fb-${m.status}`}>
      <div className="fb-meta">
        {m.status === 'new' && <span className="new-dot">New</span>}
        {m.slot && <span className="bubble-tag">{SLOT_LABEL[m.slot]}</span>}
        {m.topic && <span className="bubble-tag">{TOPIC_LABEL[m.topic]}</span>}
        <span className="muted small">{relativeTime(m.createdAt, now)}</span>
      </div>
      <p className="fb-body">“{m.body}”</p>
      {replies.map((r) => (
        <p key={r.id} className="fb-reply">
          <Reply size={12} /> You: {r.body} <span className="muted small">· {r.seenByClientAt ? 'read' : 'not read yet'}</span>
        </p>
      ))}
      {m.status !== 'resolved' && (
        <div className="btn-row">
          <button className="mini-btn" onClick={onReply}>
            <Reply size={12} /> Reply
          </button>
          {m.status === 'new' && (
            <button className="mini-btn" disabled={mut.pending} onClick={() => mut.run((d, n) => setFeedbackStatus(d, m.id, 'acknowledged', n))}>
              {mut.pending ? <Spinner size={11} /> : <Check size={12} />} Mark seen
            </button>
          )}
          <button className="mini-btn" disabled={mut.pending} onClick={() => mut.run((d, n) => setFeedbackStatus(d, m.id, 'resolved', n), { success: 'Feedback resolved' })}>
            <CheckCheck size={12} /> Resolve
          </button>
        </div>
      )}
    </li>
  );
}
