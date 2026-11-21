import { LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import { useDb } from '../data/hooks';
import { Avatar } from '../ui/kit';
import { ClientDetail } from './ClientDetail';
import { Roster } from './Roster';

export function PractitionerApp({ initialClientId = null }: { initialClientId?: string | null }) {
  const db = useDb();
  const [selected, setSelected] = useState<string | null>(initialClientId);

  return (
    <div className="pr-app">
      <header className="pr-topbar">
        <button className="brand" onClick={() => setSelected(null)}>
          <span className="brand-mark">CS</span>
          CalorieScience
        </button>
        <nav className="pr-nav">
          <button className={`pr-nav-item ${!selected ? 'is-on' : ''}`} onClick={() => setSelected(null)}>
            <LayoutDashboard size={15} /> Adherence
          </button>
        </nav>
        <div className="pr-user">
          <Avatar name={db.practitioner.name} hue={200} size={28} />
          <span>
            {db.practitioner.name}
            <small>{db.practitioner.credentials}</small>
          </span>
        </div>
      </header>
      <div className="pr-body">
        {selected ? <ClientDetail clientId={selected} onBack={() => setSelected(null)} /> : <Roster onOpen={setSelected} />}
      </div>
    </div>
  );
}
