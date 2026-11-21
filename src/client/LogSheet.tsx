import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMutation } from '../data/hooks';
import type { Cell } from '../domain/adherence';
import { logMeal, sendFeedback } from '../domain/commands';
import { CLIENT_STATUS_LABEL, HUNGER_LABEL, PREP_LABEL, REASON_LABEL } from '../domain/labels';
import { formatClock } from '../domain/time';
import type { HungerLevel, LogStatus, PrepDifficulty, ReasonCode } from '../domain/types';
import { LOG_STATUSES } from '../domain/types';
import { Chip, Spinner, StatusIcon } from '../ui/kit';
import type { Draft } from './ClientApp';

const REASONS: ReasonCode[] = ['no_time', 'at_work', 'prep_effort', 'no_food_available', 'not_hungry', 'social', 'preference', 'other'];

const QUICK_SUBS: Record<string, string[]> = {
  breakfast: ['Toast & coffee', 'Fruit only', 'Café breakfast'],
  lunch: ['Office cafeteria', 'Ordered in', 'Sandwich', 'Leftovers'],
  snack: ['Biscuits & chai', 'Fruit', 'Packaged snack', 'Coffee only'],
  dinner: ['Takeaway', 'Ate out', 'Instant noodles', 'Leftovers'],
};

export function LogSheet({
  cell,
  clientId,
  practitioner,
  onClose,
  onTell,
}: {
  cell: Cell;
  clientId: string;
  practitioner: string;
  onClose: () => void;
  onTell: (d: Draft) => void;
}) {
  const existing = cell.log;
  const [status, setStatus] = useState<LogStatus | null>(existing?.status ?? null);
  const [substitute, setSubstitute] = useState(existing?.substitute ?? '');
  const [reasons, setReasons] = useState<ReasonCode[]>(existing?.reasons ?? []);
  const [hunger, setHunger] = useState<HungerLevel | undefined>(existing?.hunger);
  const [prep, setPrep] = useState<PrepDifficulty | undefined>(existing?.prepDifficulty);
  const [time, setTime] = useState(existing?.actualTime ?? cell.planned.time);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [share, setShare] = useState(false);
  const [details, setDetails] = useState(!!existing && existing.status === 'followed' && !!(existing.hunger || existing.comment));
  const m = useMutation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleReason = (r: ReasonCode) => setReasons((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));
  const showDetails = status !== null && (status !== 'followed' || details);

  const [localError, setLocalError] = useState<string | null>(null);
  const save = async () => {
    if (!status) return;
    // Same rule the server enforces, checked instantly so the client isn't kept waiting.
    if (status === 'substituted' && !substitute.trim()) {
      setLocalError('Tell us roughly what you had instead. Even a word or two helps.');
      return;
    }
    setLocalError(null);
    const ok = await m.run(
      (db, now) => {
        logMeal(db, { clientId, date: cell.date, slot: cell.slot, status, substitute, reasons, hunger, prepDifficulty: prep, actualTime: time, comment }, now);
        if (share && comment.trim()) sendFeedback(db, { clientId, body: comment, slot: cell.slot }, now);
        return db;
      },
      { success: share && comment.trim() ? `Logged and sent to ${practitioner}` : `${cell.planned.label} logged` },
    );
    if (ok) onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <header className="sheet-head">
          <div>
            <p className="eyebrow">
              {cell.planned.label} · planned {formatClock(cell.planned.time)}
            </p>
            <h2 id="sheet-title">{existing ? 'Update your log' : 'How did it go?'}</h2>
            <p className="planned-ref">Planned: {existing?.plannedTitle ?? cell.planned.title}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="status-grid" role="radiogroup" aria-label="What happened">
          {LOG_STATUSES.map((s) => (
            <button key={s} role="radio" aria-checked={status === s} className={`status-opt status-${s} ${status === s ? 'is-on' : ''}`} onClick={() => setStatus(s)}>
              <StatusIcon state={s} size={18} />
              {CLIENT_STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <p className="honesty">There are no wrong answers. An honest log helps {practitioner} more than a perfect one.</p>

        {status === 'followed' && !details && (
          <button className="link-btn" onClick={() => setDetails(true)}>
            + Add details (optional)
          </button>
        )}

        {showDetails && (
          <div className="sheet-fields">
            {status === 'substituted' && (
              <label className="field">
                <span>What did you have instead?</span>
                <input value={substitute} onChange={(e) => setSubstitute(e.target.value)} placeholder="e.g. canteen thali" autoFocus />
                <div className="chip-row">
                  {QUICK_SUBS[cell.slot].map((s) => (
                    <Chip key={s} active={substitute === s} onClick={() => setSubstitute(s)}>
                      {s}
                    </Chip>
                  ))}
                </div>
              </label>
            )}

            {status !== 'followed' && (
              <fieldset className="field">
                <legend>What got in the way? <em>optional</em></legend>
                <div className="chip-row">
                  {REASONS.map((r) => (
                    <Chip key={r} active={reasons.includes(r)} onClick={() => toggleReason(r)}>
                      {REASON_LABEL[r]}
                    </Chip>
                  ))}
                </div>
              </fieldset>
            )}

            <fieldset className="field">
              <legend>{status === 'skipped' ? 'How hungry did you get?' : 'How did you feel after?'} <em>optional</em></legend>
              <div className="hunger-scale">
                {([1, 2, 3, 4, 5] as HungerLevel[]).map((h) => (
                  <button key={h} type="button" className={`hunger-opt ${hunger === h ? 'is-on' : ''}`} aria-pressed={hunger === h} onClick={() => setHunger(hunger === h ? undefined : h)}>
                    <span className={`hunger-dot h${h}`} />
                    {HUNGER_LABEL[h]}
                  </button>
                ))}
              </div>
            </fieldset>

            {(status === 'followed' || status === 'partial' || status === 'skipped') && (
              <fieldset className="field">
                <legend>Preparing it was… <em>optional</em></legend>
                <div className="chip-row">
                  {(Object.keys(PREP_LABEL) as PrepDifficulty[]).map((p) => (
                    <Chip key={p} active={prep === p} onClick={() => setPrep(prep === p ? undefined : p)}>
                      {PREP_LABEL[p]}
                    </Chip>
                  ))}
                </div>
              </fieldset>
            )}

            {status !== 'skipped' && (
              <label className="field field-inline">
                <span>Ate at</span>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
            )}

            <label className="field">
              <span>
                Anything else? <em>optional</em>
              </span>
              <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={status === 'partial' ? 'e.g. skipped the paneer, ran late' : 'Anything that would help explain this'} />
            </label>
            {comment.trim() && (
              <label className="check">
                <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
                Also send this to {practitioner} as a message
              </label>
            )}
          </div>
        )}

        {(localError || m.error) && (
          <p className="form-error" role="alert">
            {localError ?? m.error}
          </p>
        )}

        <div className="sheet-foot">
          <button className="btn btn-primary btn-block" disabled={!status || m.pending} onClick={save}>
            {m.pending && <Spinner />} {existing ? 'Save changes' : 'Save'}
          </button>
          {status && status !== 'followed' && (
            <button
              className="link-btn"
              onClick={() => {
                onClose();
                onTell({ slot: cell.slot });
              }}
            >
              Is this happening a lot? Tell {practitioner}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
