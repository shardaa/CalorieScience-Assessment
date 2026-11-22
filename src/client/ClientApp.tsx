import { ChartColumn, House, MessageCircle, Plus, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { useDb, useLoad } from '../data/hooks';
import type { MealSlot } from '../domain/types';
import { ErrorState, Skeleton, SkeletonList } from '../ui/kit';
import { FeedbackScreen } from './FeedbackScreen';
import { PlanScreen } from './PlanScreen';
import { ProgressScreen } from './ProgressScreen';
import { TodayScreen } from './TodayScreen';

export type ClientTab = 'today' | 'plan' | 'progress' | 'messages';
export interface Draft {
  slot?: MealSlot;
  body?: string;
}

export function ClientApp({ clientId }: { clientId: string }) {
  const db = useDb();
  const load = useLoad(`client:${clientId}`);
  const [tab, setTab] = useState<ClientTab>('today');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [logRequest, setLogRequest] = useState(0);
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
            {tab === 'today' && <TodayScreen client={client} onTell={goTell} logRequest={logRequest} onLogHandled={() => setLogRequest(0)} />}
            {tab === 'plan' && <PlanScreen client={client} />}
            {tab === 'progress' && <ProgressScreen client={client} onTell={goTell} />}
            {tab === 'messages' && <FeedbackScreen client={client} draft={draft} onDraftUsed={() => setDraft(null)} />}
          </>
        )}
      </main>
      <nav className="tabbar" aria-label="Companion app">
        {TABS.slice(0, 2).map((t) => (
          <TabButton key={t[0]} t={t} active={tab === t[0]} unread={unread} onClick={() => setTab(t[0])} />
        ))}
        <button
          className="tab-plus"
          aria-label="Log a meal"
          onClick={() => {
            setTab('today');
            setLogRequest(Date.now());
          }}
        >
          <Plus size={24} strokeWidth={2.6} />
        </button>
        {TABS.slice(2).map((t) => (
          <TabButton key={t[0]} t={t} active={tab === t[0]} unread={unread} onClick={() => setTab(t[0])} />
        ))}
      </nav>
    </div>
  );
}

const TABS = [
  ['today', 'Today', House],
  ['plan', 'Plan', UtensilsCrossed],
  ['progress', 'My week', ChartColumn],
  ['messages', 'Messages', MessageCircle],
] as const;

function TabButton({ t, active, unread, onClick }: { t: (typeof TABS)[number]; active: boolean; unread: number; onClick: () => void }) {
  const [key, label, Icon] = t;
  return (
    <button className={`tab ${active ? 'tab-active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <span className="tab-icon">
        <Icon size={20} />
        {key === 'messages' && unread > 0 && <span className="badge-dot">{unread}</span>}
      </span>
      {label}
    </button>
  );
}
