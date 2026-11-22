import { ChevronRight, Inbox as InboxIcon } from 'lucide-react';
import { useDb, useLoad, useNow } from '../data/hooks';
import { SLOT_LABEL, TOPIC_LABEL } from '../domain/labels';
import { relativeTime } from '../domain/time';
import type { Message } from '../domain/types';
import { Avatar, EmptyState, ErrorState, SkeletonList } from '../ui/kit';

/** Every client's feedback in one queue, so nothing waits for the practitioner to open the right client. */
export function Inbox({ onOpen }: { onOpen: (clientId: string) => void }) {
  const db = useDb();
  const now = useNow();
  const load = useLoad('inbox');
  const all = db.messages.filter((m) => m.author === 'client').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const groups: [string, Message[]][] = [
    ['New', all.filter((m) => m.status === 'new')],
    ['Seen, not resolved', all.filter((m) => m.status === 'acknowledged')],
    ['Resolved', all.filter((m) => m.status === 'resolved').slice(0, 10)],
  ];

  return (
    <div className="pr-page enter">
      <div className="page-head">
        <div>
          <p className="eyebrow">Inbox · {all.filter((m) => m.status === 'new').length} new</p>
          <h1>What clients told you</h1>
          <p className="muted">Feedback sent from the Companion app, newest first. Open one to read it next to that client's logs.</p>
        </div>
      </div>
      {load.status === 'loading' && <SkeletonList rows={4} h={84} />}
      {load.status === 'error' && <ErrorState message={load.message} onRetry={load.retry} />}
      {load.status === 'ready' && all.length === 0 && <EmptyState icon={<InboxIcon size={24} />} title="No client feedback yet" />}
      {load.status === 'ready' &&
        groups.map(([label, list]) =>
          list.length ? (
            <section key={label} className="inbox-group" aria-label={label}>
              <h2 className="sub">
                {label} · {list.length}
              </h2>
              <ul className="inbox-list">
                {list.map((m) => {
                  const c = db.clients.find((x) => x.id === m.clientId);
                  if (!c) return null;
                  return (
                    <li key={m.id}>
                      <button className={`inbox-row ${m.status === 'new' ? 'is-new' : ''}`} onClick={() => onOpen(c.id)}>
                        <Avatar name={c.name} hue={c.avatarHue} size={38} />
                        <span className="inbox-main">
                          <span className="inbox-meta">
                            <strong>{c.name}</strong>
                            {m.slot && <span className="bubble-tag">{SLOT_LABEL[m.slot]}</span>}
                            {m.topic && <span className="bubble-tag">{TOPIC_LABEL[m.topic]}</span>}
                            <span className="muted small">{relativeTime(m.createdAt, now)}</span>
                          </span>
                          <span className="inbox-body">“{m.body}”</span>
                        </span>
                        <ChevronRight size={16} className="muted" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null,
        )}
    </div>
  );
}
