import { Inbox as InboxIcon, Leaf, Users } from 'lucide-react';
import { useState } from 'react';
import { useDb } from '../data/hooks';
import { Avatar } from '../ui/kit';
import { ClientDetail, type DetailTab } from './ClientDetail';
import { Inbox } from './Inbox';
import { Roster } from './Roster';

type View = { kind: 'caseload' } | { kind: 'inbox' } | { kind: 'client'; id: string; tab: DetailTab; from: 'caseload' | 'inbox' };

export function PractitionerApp({ initialClientId = null }: { initialClientId?: string | null }) {
  const db = useDb();
  const [view, setView] = useState<View>(initialClientId ? { kind: 'client', id: initialClientId, tab: 'overview', from: 'caseload' } : { kind: 'caseload' });
  const newFeedback = db.messages.filter((m) => m.author === 'client' && m.status === 'new').length;
  const section = view.kind === 'client' ? view.from : view.kind;

  return (
    <div className="pr-app">
      <div className="pr-shell">
      <aside className="pr-side" aria-label="Main navigation">
        <button className="brand" onClick={() => setView({ kind: 'caseload' })}>
          <span className="brand-mark" aria-hidden>
            <Leaf size={14} />
          </span>
          <span className="brand-name">CalorieScience</span>
        </button>
        <nav className="side-nav">
          <button className={`side-item ${section === 'caseload' ? 'is-on' : ''}`} onClick={() => setView({ kind: 'caseload' })} aria-current={section === 'caseload' ? 'page' : undefined}>
            <Users size={17} />
            <span className="side-label">Caseload</span>
            <span className="side-count">{db.clients.length}</span>
          </button>
          <button className={`side-item ${section === 'inbox' ? 'is-on' : ''}`} onClick={() => setView({ kind: 'inbox' })} aria-current={section === 'inbox' ? 'page' : undefined}>
            <InboxIcon size={17} />
            <span className="side-label">Inbox</span>
            {newFeedback > 0 && <span className="side-count side-count-new">{newFeedback}</span>}
          </button>
        </nav>
        <div className="side-user">
          <Avatar name={db.practitioner.name} hue={190} size={32} />
          <span className="side-label">
            <strong>{db.practitioner.name}</strong>
            <small>{db.practitioner.credentials}</small>
          </span>
        </div>
      </aside>
      <main className="pr-body">
        {view.kind === 'caseload' && <Roster onOpen={(id, tab = 'overview') => setView({ kind: 'client', id, tab, from: 'caseload' })} />}
        {view.kind === 'inbox' && <Inbox onOpen={(id) => setView({ kind: 'client', id, tab: 'feedback', from: 'inbox' })} />}
        {view.kind === 'client' && (
          <ClientDetail
            key={view.id}
            clientId={view.id}
            tab={view.tab}
            onTab={(tab) => setView({ ...view, tab })}
            backLabel={view.from === 'inbox' ? 'Inbox' : 'Caseload'}
            onBack={() => setView({ kind: view.from })}
          />
        )}
      </main>
      </div>
    </div>
  );
}
