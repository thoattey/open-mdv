'use client';

import { ChevronLeft, Layers, Minus, Moon, Plus, Search, Sun } from 'lucide-react';

import { cn } from '@/lib/utils';

export function IconButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'glass flex size-9 items-center justify-center rounded-full text-foreground shadow-sm transition hover:bg-accent active:scale-95',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface HeaderActionsProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onToggleLayers: () => void;
  onOpenMobileSearch: () => void;
}

export function HeaderActions({
  theme,
  onToggleTheme,
  onToggleLayers,
  onOpenMobileSearch,
}: HeaderActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <IconButton className="md:hidden" onClick={onOpenMobileSearch} aria-label="Search">
        <Search className="size-4" />
      </IconButton>
      <IconButton onClick={onToggleLayers} aria-label="Layers">
        <Layers className="size-4" />
      </IconButton>
      <IconButton onClick={onToggleTheme} aria-label="Toggle theme">
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </IconButton>
    </div>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      {/* <IconButton aria-label="Home" className="hidden sm:flex">
        <ChevronLeft className="size-4" />
      </IconButton> */}
      <div className="glass flex h-9 items-center gap-2 rounded-full px-4 shadow-sm">
        <span className="text-sm font-bold tracking-tight">Open <span className='text-primary'>MDV</span></span>
      </div>
    </div>
  );
}

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export function ZoomControls({ zoom, onZoomIn, onZoomOut }: ZoomControlsProps) {
  return (
    <>
      <div className="glass absolute right-3 top-16 z-20 flex flex-col items-center rounded-2xl px-3 py-2 shadow-sm md:hidden">
        <span className="text-[10px] font-medium uppercase text-muted-foreground">Zoom</span>
        <span className="text-lg font-semibold tabular-nums">{zoom.toFixed(0)}</span>
      </div>

      <div className="absolute bottom-24 right-3 z-20 flex flex-col gap-2 md:bottom-6">
        <IconButton onClick={onZoomIn} aria-label="Zoom in" className="size-10">
          <Plus className="size-4" />
        </IconButton>
        <IconButton onClick={onZoomOut} aria-label="Zoom out" className="size-10">
          <Minus className="size-4" />
        </IconButton>
      </div>

      <div className="glass absolute bottom-6 right-20 z-20 hidden items-center gap-2 rounded-full px-4 py-2 shadow-sm md:flex">
        <span className="text-[11px] font-medium uppercase text-muted-foreground">Zoom</span>
        <span className="text-sm font-semibold tabular-nums">{zoom.toFixed(1)}</span>
      </div>
    </>
  );
}

export function InfoBar({ zoom }: { zoom: number }) {
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 hidden -translate-x-1/2 gap-2 md:flex">
      <Chip active={zoom >= 16}>Parcels: Zoom 16+</Chip>
      <Chip active={zoom >= 17}>Plots: Zoom 17+</Chip>
      <Chip active={zoom >= 18}>Addresses: Zoom 18+</Chip>
    </div>
  );
}

function Chip({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'glass rounded-full px-3 py-1.5 text-xs font-medium shadow-sm transition',
        active ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}
