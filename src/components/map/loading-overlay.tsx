'use client';

import { LogoMark } from '@/components/brand/logo-mark';
import { cn } from '@/lib/utils';

/** Full-screen boot overlay shown until the static layers finish loading. */
export function LoadingOverlay({ visible }: { visible: boolean }) {
  return (
    <div
      className={cn(
        'absolute inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-md transition-opacity duration-500',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div className="glass flex w-72 flex-col items-center gap-4 rounded-3xl px-8 py-10 shadow-2xl">
        <div className="relative size-14">
          <div
            className="absolute inset-0 rounded-full border-[3px] border-primary/20 border-t-primary"
            style={{ animation: 'atlas-spin 0.9s linear infinite' }}
          />
          <LogoMark className="absolute inset-0 m-auto size-6 text-primary" />
        </div>
        <div className="text-center">
          <h3 className="text-base font-semibold">Raajje Atlas</h3>
          <p className="mt-1 text-sm text-muted-foreground">Preparing map data…</p>
        </div>
      </div>
    </div>
  );
}
