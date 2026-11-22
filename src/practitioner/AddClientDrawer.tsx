import { UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMutation } from '../data/hooks';
import { addClient, newId } from '../domain/commands';
import { Spinner } from '../ui/kit';

const WEEKS = [4, 6, 8, 12];

/** New client: the essentials only. Everything else (plan tweaks, notes) happens on their record. */
export function AddClientDrawer({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');
  const [occupation, setOccupation] = useState('');
  const [goal, setGoal] = useState('');
  const [weeks, setWeeks] = useState(4);
  const m = useMutation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = newId('c');
    const first = name.trim().split(/\s+/)[0] || 'Client';
    const ok = await m.run((db, now) => addClient(db, { id, name, email, age: Number(age), occupation, goal, programmeWeeks: weeks }, now), {
      success: `${first} added. Now build their plan.`,
    });
    if (ok) onAdded(id);
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="add-title" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2 id="add-title" className="drawer-title">
            <UserPlus size={18} /> Add a client
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <form className="drawer-body form add-form" onSubmit={submit} noValidate>
          <label className="field">
            <span>Full name</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Asha Verma" maxLength={60} autoComplete="off" />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" />
            <small className="field-hint">They sign in to the Companion app with this email to see their plan.</small>
          </label>
          <div className="field-pair">
            <label className="field">
              <span>Occupation <em>optional</em></span>
              <input value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="e.g. Nurse, night shifts" />
            </label>
            <label className="field field-narrow">
              <span>Age</span>
              <input type="number" inputMode="numeric" min={12} max={100} value={age} onChange={(e) => setAge(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Programme goal</span>
            <textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Steadier energy through long shifts" />
          </label>
          <fieldset className="field">
            <legend>Programme length</legend>
            <div className="chip-row">
              {WEEKS.map((w) => (
                <button type="button" key={w} className={`chip ${weeks === w ? 'chip-active' : ''}`} aria-pressed={weeks === w} onClick={() => setWeeks(w)}>
                  {w} weeks
                </button>
              ))}
            </div>
          </fieldset>

          <div className="starter">
            <p className="starter-title">Next: build their meal plan</p>
            <p className="muted small">After you add them, their Meal plan tab opens with the starter meals ready to tailor. They see the plan in the app as soon as you share it.</p>
          </div>

          {m.error && (
            <p className="form-error" role="alert">
              {m.error}
            </p>
          )}
          <div className="btn-row">
            <button className="btn btn-primary" disabled={m.pending}>
              {m.pending ? <Spinner /> : <UserPlus size={15} />} Add client
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
