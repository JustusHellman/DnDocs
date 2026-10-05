import { useState } from 'react';
import { BookOpen, Map as MapIcon, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { friendlyError } from '../lib/errors';
import { Segmented } from '../components/ui/bits';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function Login() {
  const { login, loginWithEmail, registerWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(friendlyError(err, 'Sign-in failed.'));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => (mode === 'register' ? registerWithEmail(email, password, displayName) : loginWithEmail(email, password)));
  };

  const forgot = () => {
    if (!email) return setError('Enter your email first, then press “Forgot password?”.');
    run(async () => {
      await resetPassword(email);
      setInfo('Check your inbox for a password reset link.');
    });
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand side */}
      <div className="leather leather-edge-r relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(800px_400px_at_20%_20%,rgb(217_178_95/0.12),transparent)]" />
        <div className="relative font-display text-2xl font-bold text-amber-400">DnDocs</div>
        <div className="relative max-w-md space-y-6">
          <h1 className="font-display text-4xl leading-tight font-semibold text-stone-50">Your campaign’s living archive.</h1>
          <ul className="space-y-4 text-stone-300">
            <li className="flex gap-3">
              <BookOpen className="mt-0.5 shrink-0 text-amber-400" size={20} /> NPCs, places, quests, items and notes — linked together.
            </li>
            <li className="flex gap-3">
              <Users className="mt-0.5 shrink-0 text-amber-400" size={20} /> DMs decide exactly what each player gets to know.
            </li>
            <li className="flex gap-3">
              <MapIcon className="mt-0.5 shrink-0 text-amber-400" size={20} /> Interactive maps you can drill down into.
            </li>
          </ul>
        </div>
        <p className="relative text-xs text-stone-600">Roll for initiative.</p>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:text-left">
            <div className="mb-2 font-display text-3xl font-bold text-amber-400 lg:hidden">DnDocs</div>
            <h2 className="font-display text-2xl font-semibold text-stone-50">{mode === 'signin' ? 'Welcome back' : 'Create an account'}</h2>
            <p className="mt-1 text-sm text-stone-400">Sign in to open your campaigns.</p>
          </div>

          <button type="button" disabled={busy} onClick={() => run(login)} className="btn btn-secondary w-full">
            <GoogleIcon /> Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-stone-500">
            <div className="h-px flex-1 bg-stone-800" /> or with email <div className="h-px flex-1 bg-stone-800" />
          </div>

          <Segmented
            className="mb-5 w-full"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError('');
            }}
            options={[
              { value: 'signin', label: 'Sign in' },
              { value: 'register', label: 'Register' },
            ]}
          />

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label" htmlFor="name">
                  Display name
                </label>
                <input id="name" className="input" required autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Mira the Bold" />
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input id="email" type="email" inputMode="email" className="input" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label className="label" htmlFor="password">
                  Password
                </label>
                {mode === 'signin' && (
                  <button type="button" onClick={forgot} className="text-xs text-stone-400 hover:text-amber-300">
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="password"
                type="password"
                className="input"
                required
                minLength={6}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-300" role="alert">{error}</p>}
            {info && <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">{info}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary w-full">
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
