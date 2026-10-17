import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';

export type AccountMode = 'signUp' | 'signIn';

export function AccountDialog({ mode, onMode, onClose }: {
  mode: AccountMode; onMode: (mode: AccountMode) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { signIn } = useAuthActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    data.set('flow', mode);
    try { await signIn('password', data); }
    catch {
      setError(mode === 'signIn'
        ? 'Could not log in. Check your email and password, then try again.'
        : 'Could not create your account. If you already signed up, try logging in.');
    } finally { setBusy(false); }
  }

  return <dialog className="account-dialog" ref={dialog} aria-labelledby="account-title" onCancel={onClose}
    onClick={event => { if (event.target === dialog.current) {
      const bounds = dialog.current.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    } }}>
    <button type="button" className="account-close" aria-label="Close account box" onClick={onClose}>×</button>
    <h2 id="account-title">{mode === 'signUp' ? 'Sign up free to keep asking' : 'Log in to Bharat Guide'}</h2>
    <p className="account-intro">Your chat stays here. The daily limit stays at 20 questions.</p>
    <form onSubmit={submit} aria-busy={busy}>
      <label htmlFor="account-email">Email</label>
      <input autoFocus id="account-email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy} />
      <label htmlFor="account-password">Password</label>
      <input id="account-password" name="password" type="password" autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
        minLength={8} required aria-describedby={mode === 'signUp' ? 'account-password-help' : undefined} disabled={busy} />
      {mode === 'signUp' && <p id="account-password-help" className="account-help">Use at least 8 characters.</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      <button className="account-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signUp' ? 'Sign up free' : 'Log in'}</button>
    </form>
    <button className="account-switch" type="button" disabled={busy} onClick={() => { setError(''); onMode(mode === 'signUp' ? 'signIn' : 'signUp'); }}>
      {mode === 'signUp' ? 'Already have an account? Log in' : 'New here? Sign up free'}
    </button>
  </dialog>;
}
