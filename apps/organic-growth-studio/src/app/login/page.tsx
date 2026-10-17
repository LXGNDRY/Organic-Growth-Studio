'use client';

import { FormEvent, useState } from 'react';

export default function LoginPage() {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not sign in.');
      window.location.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark">OG</div>
        <p className="login-eyebrow">PERSONAL WORKSPACE</p>
        <h1>Organic Growth Studio</h1>
        <p className="login-copy">Sign in with the owner access token configured for this instance.</p>
        <label htmlFor="access-token">Owner access token</label>
        <input
          id="access-token"
          name="accessToken"
          type="password"
          autoComplete="current-password"
          value={token}
          onChange={event => setToken(event.target.value)}
          required
          minLength={32}
          maxLength={512}
          autoFocus
        />
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy || token.length < 32}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="login-footnote">Your token is not stored in browser storage. This workspace is configured for one owner.</p>
      </form>
    </main>
  );
}
