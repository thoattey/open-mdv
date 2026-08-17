'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ImportPanel } from '@/components/admin/import-panel';
import { ResidentsPanel } from '@/components/admin/residents-panel';

/**
 * /admin — the data control console.
 *
 * A shell over two tools that share nothing but the session: the resident
 * register, where records are censored out of every public view, and the batch
 * importer that loads the business register. Each panel owns its own controls
 * and status readout; this file owns only the frame and the tab it shows.
 */

type Tab = 'register' | 'import';

const TABS: { key: Tab; label: string }[] = [
  { key: 'register', label: 'residents' },
  { key: 'import', label: 'import' },
];

export function AdminConsole({ admin }: { admin: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('register');

  const signOut = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.refresh();
  };

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      <header className="shrink-0 border-b border-[var(--mx-line)] bg-black/70 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="mx-glow text-sm font-bold tracking-[0.3em]">
            RAAJJE<span className="text-[var(--mx-accent)]">{'//'}</span>CONTROL
            <span className="mx-caret ml-1">_</span>
          </h1>

          <div className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                className="mx-btn"
                data-active={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-[var(--mx-dim)]">op: {admin}</span>
            <Link className="mx-btn" href="/business">
              business
            </Link>
            <Link className="mx-btn" href="/grid">
              ← grid
            </Link>
            <button className="mx-btn" onClick={signOut}>
              sign out
            </button>
          </div>
        </div>
      </header>

      {tab === 'register' ? <ResidentsPanel /> : <ImportPanel />}
    </div>
  );
}
