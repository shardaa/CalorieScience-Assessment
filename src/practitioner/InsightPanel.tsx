import { ArrowRight, Eye, Lightbulb, ListChecks, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { Analysis } from '../domain/insights';
import type { ActionDraft } from './ClientDetail';

/**
 * Three tiers, never blended: what the logs show (counted), what might explain it
 * (unconfirmed), and what is worth reviewing. Each has its own look so a fact can't
 * be mistaken for a guess.
 */
export function InsightPanel({ a, onAct }: { a: Analysis; onAct: (d: Omit<ActionDraft, 'nonce'>) => void }) {
  const [showAll, setShowAll] = useState(false);
  const obs = showAll ? a.observations : a.observations.slice(0, 6);

  if (a.summary.logged === 0 && a.dataQuality.length === 0) return null;

  return (
    <section className="panel insight" aria-labelledby="insight-title">
      <header className="panel-head">
        <h2 id="insight-title">What the logs show</h2>
        <span className="panel-meta">Last 7 complete days · rules-based</span>
      </header>

      {a.summary.logged > 0 && (
        <>
          <div className="tier tier-observed">
            <h3>
              <Eye size={14} /> Observed <span className="tier-count">{a.observations.length}</span>
            </h3>
            <ul>
              {obs.map((o) => (
                <li key={o.id} className={`obs obs-${o.tone}`}>
                  <span className="obs-dot" aria-hidden />
                  <span className="obs-text">{o.text}</span>
                  {o.tone === 'concern' && o.slot && (
                    <button className="mini-btn" onClick={() => onAct({ tab: 'adjust', slot: o.slot, basedOn: o.text })}>
                      Act on this <ArrowRight size={12} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {a.observations.length > 6 && (
              <button className="link-btn" onClick={() => setShowAll((s) => !s)}>
                {showAll ? 'Show fewer' : `Show all ${a.observations.length}`}
              </button>
            )}
          </div>

          <div className="tier-pair">
            {a.interpretations.length > 0 && (
              <div className="tier tier-interpret">
                <h3>
                  <Lightbulb size={14} /> Possible explanations <span className="unconfirmed">Not confirmed</span>
                </h3>
                <ul>
                  {a.interpretations.map((i) => (
                    <li key={i.id}>{i.text}</li>
                  ))}
                </ul>
              </div>
            )}
            {a.considerations.length > 0 && (
              <div className="tier tier-consider">
                <h3>
                  <ListChecks size={14} /> Worth considering
                </h3>
                <ul>
                  {a.considerations.map((c) => (
                    <li key={c.id}>
                      <span>{c.text}</span>
                      {c.slot && !c.id.endsWith('-keep') && (
                        <button className="mini-btn" onClick={() => onAct({ tab: 'adjust', slot: c.slot, basedOn: c.text })}>
                          Draft change <ArrowRight size={12} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}

      {a.dataQuality.length > 0 && (
        <div className="data-quality">
          <TriangleAlert size={14} />
          <div>
            {a.dataQuality.map((d) => (
              <p key={d}>{d}</p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
