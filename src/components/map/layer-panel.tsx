'use client';

import {
  Grid2x2,
  House,
  Layers,
  Map as MapIcon,
  MapPin,
  Plane,
  Spline,
  Square,
  Star,
  Tag,
  X,
  type LucideIcon,
} from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import { UI_LAYERS } from '@/lib/map-config';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  MapPin,
  Vector: Square,
  House,
  Grid2x2,
  Spline,
  Map: MapIcon,
  Plane,
  Star,
  Tag,
};

interface LayerPanelProps {
  open: boolean;
  onClose: () => void;
  visibility: Record<string, boolean>;
  onToggle: (key: string, value: boolean) => void;
}

export function LayerPanel({ open, onClose, visibility, onToggle }: LayerPanelProps) {
  return (
    <div
      className={cn(
        'glass absolute right-3 top-16 z-30 w-72 overflow-hidden rounded-2xl shadow-xl transition-all duration-300',
        open ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0',
      )}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="size-4 text-primary" />
          Layers
        </span>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          aria-label="Close layers"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-2">
        {UI_LAYERS.map((layer) => {
          const Icon = ICONS[layer.icon] ?? Square;
          return (
            <label
              key={layer.key}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-accent/60"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm">{layer.label}</span>
              <Switch
                checked={visibility[layer.key] ?? layer.defaultOn}
                onCheckedChange={(v) => onToggle(layer.key, v)}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
