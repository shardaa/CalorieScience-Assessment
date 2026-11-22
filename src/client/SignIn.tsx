import { ArrowRight, Leaf } from 'lucide-react';
import { useState } from 'react';
import { useDb } from '../data/hooks';
import { session } from '../data/session';

/** Email sign-in for the Companion app. Prototype only: no code is sent, the email just has to match a client. */
export function SignIn() {
  const db = useDb();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const practitioner = db.practitioner.name.split(' ')[0];
  const samples = db.clients.slice(-2).concat(db.clients.filter((c) => c.id === 'c_ananya')).slice(0, 3);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) return setError('Enter the email your nutritionist has for you.');
    const client = db.clients.find((c) => c.email === value);
    if (!client) return setError(`We couldn't find a programme for that email. Check with ${practitioner} which email is on file.`);
    setError(null);
    session.signIn(client.id);
  };

  return (
    <div className="signin enter">
      <div className="signin-brand">
        <span className="brand-mark" aria-hidden>
          <Leaf size={18} />
        </span>
        <span>CalorieScience Companion</span>
      </div>
      <div className="signin-hero" aria-hidden>
        <span>🥗</span>
        <span>🍎</span>
        <span>🥞</span>
      </div>
      <h1>Your meal plan, day by day</h1>
      <p className="hello-sub">Sign in with the email your nutritionist added you with.</p>
      <form className="signin-form" onSubmit={submit} noValidate>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-block">
          Continue <ArrowRight size={16} />
        </button>
      </form>
      <div className="signin-demo">
        <p className="muted small">Prototype: no code is sent. Try one of these:</p>
        <div className="chip-row">
          {samples.map((c) => (
            <button key={c.id} type="button" className="chip" onClick={() => setEmail(c.email)}>
              {c.email}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
