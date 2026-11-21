import { ChartColumn, House, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { useDb, useLoad } from '../data/hooks';
import type { MealSlot } from '../domain/types';
import { ErrorState, Skeleton, SkeletonList } from '../ui/kit';
import { FeedbackScreen } from './FeedbackScreen';
import { ProgressScreen } from './ProgressScreen';
import { TodayScreen } from './TodayScreen';

export type ClientTab = 'today' | 'progress' | 'messages';
export interface Draft {
  slot?: MealSlot;
  body?: string;
}

export function ClientApp({ clientId }: { clientId: string }) {
  const db = useDb();
  const load = useLoad(`client:${clientId}`);
  const [tab, setTab] = useState<ClientTab>('today');
  const [draft, setDraft] = useState<Draft | null>(null);
  const client = db.clients.find((c) => c.id === clientId);

  const unread = db.messages.filter((m) => m.clientId === clientId && m.author === 'practitioner' && !m.seenByClientAt).length;

  const goTell = (d: Draft) => {
    setDraft(d);
    setTab('messages');
  };

  return (
    <div className="client-app">
      <main className="client-body">
        {load.status === 'loading' && (
          <div className="client-pad stack">
            <Skeleton h={22} w="60%" />
            <Skeleton h={14} w="40%" />
            <Skeleton h={56} r={14} />
            <SkeletonList rows={4} h={92} />
          </div>
        )}
        {load.status === 'error' && <ErrorState message={load.message} onRetry={load.retry} />}
        {load.status === 'ready' && !client && <ErrorState message="This client profile no longer exists." onRetry={load.retry} />}
        {load.status === 'ready' && client && (
          <>
            {tab === 'today' && <TodayScreen client={client} onTell={goTell} />}
            {tab === 'progress' && <ProgressScreen client={client} onTell={goTell} />}
            {tab === 'messages' && <FeedbackScreen client={client} draft={draft} onDraftUsed={() => setDraft(null)} />}
          </>
        )}
      </main>
      <nav className="tabbar" aria-label="Companion app">
        {(
          [
            ['today', 'Today', House],
            ['progress', 'My week', ChartColumn],
            ['messages', 'Messages', MessageCircle],
          ] as const
        ).map(([key, label, Icon]) => (
          <button key={key} className={`tab ${tab === key ? 'tab-active' : ''}`} onClick={() => setTab(key)} aria-current={tab === key ? 'page' : undefined}>
            <span className="tab-icon">
              <Icon size={20} />
              {key === 'messages' && unread > 0 && <span className="badge-dot">{unread}</span>}
            </span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
