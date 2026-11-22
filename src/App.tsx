import { ArrowUpRight, LayoutDashboard, Leaf, RotateCcw, SlidersHorizontal, Smartphone, Users, WifiOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ClientApp } from './client/ClientApp';
import { backend } from './data/backend';
import { useSettings, useToast } from './data/hooks';
import { PRIMARY_CLIENT_ID } from './domain/seed';
import { PractitionerApp } from './practitioner/PractitionerApp';

type Route = 'demo' | 'client' | 'practitioner';

function readRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return h.startsWith('client') ? 'client' : h.startsWith('practitioner') ? 'practitioner' : 'demo';
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [mobilePane, setMobilePane] = useState<'client' | 'practitioner'>('client');
  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  if (route === 'client')
    return (
      <div className="standalone-client">
        <ClientApp clientId={PRIMARY_CLIENT_ID} />
        <DemoControls />
      </div>
    );
  if (route === 'practitioner')
    return (
      <>
        <PractitionerApp />
        <DemoControls />
      </>
    );

  return (
    <div className="demo">
      <header className="demo-bar">
        <div className="demo-brand">
          <span className="brand-mark" aria-hidden>
            <Leaf size={14} />
          </span>
          <strong>CalorieScience</strong>
          <span className="demo-tag">Companion · live prototype</span>
        </div>
        <p className="demo-sub">One shared data store. Log a meal on the phone or change the plan on the dashboard, and the other side updates.</p>
        <div className="demo-switch" role="tablist" aria-label="Pane">
          <button role="tab" aria-selected={mobilePane === 'client'} className={mobilePane === 'client' ? 'is-on' : ''} onClick={() => setMobilePane('client')}>
            <Smartphone size={14} /> Client
          </button>
          <button role="tab" aria-selected={mobilePane === 'practitioner'} className={mobilePane === 'practitioner' ? 'is-on' : ''} onClick={() => setMobilePane('practitioner')}>
            <LayoutDashboard size={14} /> Practitioner
          </button>
        </div>
        <nav className="demo-links" aria-label="Open separately">
          <a href="#/client" target="_blank" rel="noreferrer">
            Client app <ArrowUpRight size={13} />
          </a>
          <a href="#/practitioner" target="_blank" rel="noreferrer">
            Dashboard <ArrowUpRight size={13} />
          </a>
        </nav>
      </header>
      <div className={`demo-panes show-${mobilePane}`}>
        <section className="pane-client" aria-label="Client Companion App (Ananya)">
          <p className="pane-label">
            <span className="pane-dot" /> Ananya · Companion app
          </p>
          <div className="phone">
            <span className="phone-island" aria-hidden />
            <ClientApp clientId={PRIMARY_CLIENT_ID} />
          </div>
        </section>
        <section className="pane-practitioner" aria-label="Practitioner dashboard">
          <p className="pane-label">
            <span className="pane-dot pane-dot-pr" /> Neha · Practitioner dashboard
          </p>
          <div className="app-window">
            <PractitionerApp initialClientId={PRIMARY_CLIENT_ID} />
          </div>
        </section>
      </div>
      <DemoControls />
    </div>
  );
}

function DemoControls() {
  const settings = useSettings();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  return (
    <div className={`demo-controls ${open ? 'is-open' : ''}`}>
      {open ? (
        <div className="dc-panel" role="dialog" aria-label="Demo controls">
          <header>
            <strong>Demo controls</strong>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close demo controls">
              <X size={15} />
            </button>
          </header>
          <p className="muted small">Simulated backend. Use these to see loading, error and scale states.</p>
          <label className="check">
            <input type="checkbox" checked={settings.offline} onChange={(e) => backend.updateSettings({ offline: e.target.checked })} />
            <WifiOff size={13} /> Simulate offline (requests fail)
          </label>
          <label className="field field-inline">
            <span>Network latency</span>
            <select value={settings.latency} onChange={(e) => backend.updateSettings({ latency: e.target.value as 'fast' | 'normal' | 'slow' })}>
              <option value="fast">Fast (~60 ms)</option>
              <option value="normal">Normal (~450 ms)</option>
              <option value="slow">Slow (~1.6 s)</option>
            </select>
          </label>
          <div className="btn-col">
            <button
              className="btn btn-ghost"
              onClick={() => {
                backend.reset();
                toast({ tone: 'info', text: 'Demo data reset to the scenario' });
              }}
            >
              <RotateCcw size={13} /> Reset scenario data
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                backend.reset(72);
                toast({ tone: 'info', text: 'Loaded 80-client caseload' });
              }}
            >
              <Users size={13} /> Load 80-client caseload
            </button>
          </div>
        </div>
      ) : (
        <button className="dc-toggle" onClick={() => setOpen(true)} aria-label="Open demo controls">
          <SlidersHorizontal size={15} /> Demo
          {settings.offline && <span className="dc-off">offline</span>}
        </button>
      )}
    </div>
  );
}
