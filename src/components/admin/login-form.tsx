'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Sign-in for the data control console. Credentials live in .env.local — see
 * src/lib/admin-session.ts — so this posts them once and then relies on the
 * session cookie the server sets.
 */
export function LoginForm({ missing }: { missing: string[] }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const configured = missing.length === 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? 'sign-in failed');
        return;
      }
      // The page decides between this form and the console on the server, so a
      // refresh is what swaps them once the cookie exists.
      router.refresh();
    } catch {
      setError('network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="mx-panel w-full max-w-sm p-5">
        <h1 className="mx-glow text-sm font-bold tracking-[0.3em]">
          RAAJJE<span className="text-[var(--mx-accent)]">{'//'}</span>CONTROL
          <span className="mx-caret ml-1">_</span>
        </h1>
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--mx-dim)]">
          RESTRICTED — DATA CONTROL CONSOLE. CENSORED RECORDS ARE WITHHELD FROM SEARCH, THE GRID,
          AND THE MAP.
        </p>

        {configured ? (
          <form className="mt-5 space-y-3" onSubmit={submit}>
            <div>
              <label className="mx-label block" htmlFor="admin-user">
                Operator
              </label>
              <input
                id="admin-user"
                className="mx-field mt-1 w-full"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="mx-label block" htmlFor="admin-pass">
                Passphrase
              </label>
              <input
                id="admin-pass"
                className="mx-field mt-1 w-full"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-[10px] uppercase" style={{ color: 'var(--mx-danger)' }}>
                &gt; {error}
              </p>
            )}

            <button className="mx-btn w-full justify-center" type="submit" disabled={busy}>
              {busy ? 'authenticating…' : 'authenticate'}
            </button>
          </form>
        ) : (
          <div className="mt-5 space-y-2 text-[10px] leading-relaxed">
            <p style={{ color: 'var(--mx-danger)' }}>&gt; CONSOLE NOT CONFIGURED</p>
            <p className="text-[var(--mx-dim)]">
              Add the following to <code>.env.local</code> and restart the dev server:
            </p>
            <pre className="overflow-x-auto border border-[var(--mx-line)] p-2 text-[var(--mx-bright)]">
              {missing.map((k) => `${k}=…`).join('\n')}
            </pre>
          </div>
        )}

        <a className="mx-btn mt-5 w-full justify-center" href="/grid">
          ← grid
        </a>
      </div>
    </div>
  );
}
