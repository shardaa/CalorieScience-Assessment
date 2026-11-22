import { CheckCheck, Inbox, Send, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { backend } from '../data/backend';
import { useDb, useMutation, useNow } from '../data/hooks';
import { markRecommendationSeen, sendFeedback } from '../domain/commands';
import { SLOT_LABEL, TOPIC_LABEL } from '../domain/labels';
import { relativeTime } from '../domain/time';
import type { Client, FeedbackTopic, MealSlot, Message } from '../domain/types';
import { SLOTS } from '../domain/types';
import { Chip, EmptyState, Spinner } from '../ui/kit';
import type { Draft } from './ClientApp';

const PROMPTS = [
  { body: "I can't manage my afternoon snack when I'm at the office.", slot: 'snack' as MealSlot, topic: 'timing' as FeedbackTopic },
  { body: 'I get very hungry in the late afternoon.', topic: 'hunger' as FeedbackTopic },
  { body: 'This meal takes too long to prepare on weekdays.', topic: 'preparation' as FeedbackTopic },
];

const CLIENT_STATUS: Record<string, string> = { new: 'Sent', acknowledged: 'Seen', resolved: 'Resolved' };

export function FeedbackScreen({ client, draft, onDraftUsed }: { client: Client; draft: Draft | null; onDraftUsed: () => void }) {
  const db = useDb();
  const now = useNow();
  const practitioner = db.practitioner.name.split(' ')[0];
  const [body, setBody] = useState('');
  const [slot, setSlot] = useState<MealSlot | undefined>();
  const [topic, setTopic] = useState<FeedbackTopic | undefined>();
  const m = useMutation();

  useEffect(() => {
    if (draft) {
      setSlot(draft.slot);
      if (draft.body) setBody(draft.body);
      onDraftUsed();
    }
  }, [draft, onDraftUsed]);

  const thread = db.messages.filter((x) => x.clientId === client.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // Opening Messages counts as reading practitioner messages (practitioner sees "Read").
  useEffect(() => {
    const unseen = thread.filter((x) => x.author === 'practitioner' && !x.seenByClientAt);
    if (unseen.length)
      void backend
        .run((d, n) => {
          unseen.forEach((u) => markRecommendationSeen(d, u.id, n));
          return d;
        })
        .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.length]);

  const send = async () => {
    const ok = await m.run((d, n) => sendFeedback(d, { clientId: client.id, body, slot, topic }, n), { success: `Sent to ${practitioner}` });
    if (ok) {
      setBody('');
      setSlot(undefined);
      setTopic(undefined);
    }
  };

  return (
    <div className="client-pad">
      <header className="client-header">
        <h1>Talk to {practitioner}</h1>
        <p className="hello-sub">Your nutritionist reads every message.</p>
      </header>

      <section className="card compose">
        <h3 className="card-title">What's getting in the way?</h3>
        <p className="muted small">
          {practitioner} reviews these alongside your logs and may adjust your plan. Most replies within one working day.
        </p>
        <div className="chip-row">
          {(Object.keys(TOPIC_LABEL) as FeedbackTopic[]).map((t) => (
            <Chip key={t} active={topic === t} onClick={() => setTopic(topic === t ? undefined : t)}>
              {TOPIC_LABEL[t]}
            </Chip>
          ))}
        </div>
        <div className="chip-row">
          <span className="muted small">About:</span>
          {SLOTS.map((s) => (
            <Chip key={s} active={slot === s} onClick={() => setSlot(slot === s ? undefined : s)} tone="soft">
              {SLOT_LABEL[s]}
            </Chip>
          ))}
        </div>
        <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={`e.g. ${PROMPTS[0].body}`} aria-label="Message" />
        {!body && (
          <div className="prompt-list">
            {PROMPTS.map((p) => (
              <button
                key={p.body}
                className="prompt"
                onClick={() => {
                  setBody(p.body);
                  if (p.slot) setSlot(p.slot);
                  setTopic(p.topic);
                }}
              >
                “{p.body}”
              </button>
            ))}
          </div>
        )}
        {m.error && <p className="form-error">{m.error}</p>}
        <button className="btn btn-primary btn-block" onClick={send} disabled={m.pending || !body.trim()}>
          {m.pending ? <Spinner /> : <Send size={14} />} Send to {practitioner}
        </button>
      </section>

      <h3 className="section-title">Conversation</h3>
      {thread.length === 0 ? (
        <EmptyState icon={<Inbox size={24} />} title="No messages yet">
          When you or {practitioner} send something, it will appear here.
        </EmptyState>
      ) : (
        <ul className="thread">
          {thread.map((msg) => (
            <Bubble key={msg.id} msg={msg} now={now} practitioner={db.practitioner.name} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Bubble({ msg, now, practitioner }: { msg: Message; now: Date; practitioner: string }) {
  const mine = msg.author === 'client';
  return (
    <li className={`bubble ${mine ? 'bubble-me' : 'bubble-them'}`}>
      {!mine && (
        <span className="bubble-from">
          <Sparkles size={12} /> {practitioner}
          {msg.adjustmentId && <span className="tag-updated">Plan update</span>}
        </span>
      )}
      {msg.slot && <span className="bubble-tag">{SLOT_LABEL[msg.slot]}</span>}
      <p>{msg.body}</p>
      <span className="bubble-meta">
        {relativeTime(msg.createdAt, now)}
        {mine && msg.status && (
          <>
            {' · '}
            {msg.status !== 'new' && <CheckCheck size={12} />} {CLIENT_STATUS[msg.status]}
          </>
        )}
      </span>
    </li>
  );
}
