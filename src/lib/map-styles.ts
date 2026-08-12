import type { FeatureLike } from 'ol/Feature';
import { Circle, Fill, RegularShape, Stroke, Style, Text } from 'ol/style';

/**
 * Vector styling for every layer, adapted from the original viewer. Styles are
 * cached per (layer, theme) where they are static, and computed per-feature only
 * where the look depends on a property (parcel category) or on resolution
 * (label decluttering).
 */

export type ThemeName = 'light' | 'dark';

interface Palette {
  text: string;
  textHalo: string;
  parcelStroke: string;
  addressFill: string;
  addressStroke: string;
  /** Solid marker colour, reused by the focused-address highlight. */
  addressDot: string;
  plotLine: string;
  atollBoundary: string;
  adminFill: string;
  adminStroke: string;
}

const PALETTE: Record<ThemeName, Palette> = {
  dark: {
    text: '#ffffff',
    textHalo: 'rgba(0,0,0,0.75)',
    parcelStroke: 'rgba(120,170,255,0.65)',
    // Light translucent fill so a dense field of address squares stays readable.
    addressFill: 'rgba(90,170,255,0.22)',
    addressStroke: 'rgba(120,190,255,0.75)',
    addressDot: '#0a84ff',
    plotLine: 'rgba(255,214,120,0.7)',
    atollBoundary: 'rgba(94,92,230,0.9)',
    adminFill: 'rgba(10,132,255,0.05)',
    adminStroke: 'rgba(10,132,255,0.4)',
  },
  light: {
    text: '#1c1c1e',
    textHalo: 'rgba(255,255,255,0.85)',
    parcelStroke: 'rgba(0,90,200,0.6)',
    addressFill: 'rgba(0,122,255,0.16)',
    addressStroke: 'rgba(0,100,220,0.6)',
    addressDot: '#007aff',
    plotLine: 'rgba(200,140,0,0.85)',
    atollBoundary: 'rgba(88,86,214,0.9)',
    adminFill: 'rgba(0,122,255,0.04)',
    adminStroke: 'rgba(0,122,255,0.35)',
  },
};

/** Parcel fill by land-use category, translucent so the basemap reads through. */
const PARCEL_CATEGORY_FILL: Record<string, string> = {
  Residential: 'rgba(52,199,89,0.18)',
  Commercial: 'rgba(255,149,0,0.20)',
  Industrial: 'rgba(175,82,222,0.18)',
  Recreational: 'rgba(48,209,88,0.14)',
  Government: 'rgba(0,122,255,0.18)',
  Mixed: 'rgba(255,204,0,0.16)',
  Social: 'rgba(90,200,250,0.18)',
};
const PARCEL_DEFAULT_FILL = 'rgba(142,142,147,0.14)';

function label(text: string, p: Palette, font: string, offsetY = 0): Text {
  return new Text({
    text,
    font,
    fill: new Fill({ color: p.text }),
    stroke: new Stroke({ color: p.textHalo, width: 3 }),
    offsetY,
    overflow: true,
  });
}

export function makeStyleFns(theme: ThemeName) {
  const p = PALETTE[theme];

  return {
    parcels(feature: FeatureLike): Style {
      const category = String(feature.get('Category') ?? '');
      return new Style({
        fill: new Fill({ color: PARCEL_CATEGORY_FILL[category] ?? PARCEL_DEFAULT_FILL }),
        stroke: new Stroke({ color: p.parcelStroke, width: 1 }),
      });
    },

    house_parcels: new Style({
      fill: new Fill({ color: 'rgba(255,159,10,0.10)' }),
      stroke: new Stroke({ color: 'rgba(255,159,10,0.75)', width: 1 }),
    }),

    plot_lines: new Style({
      stroke: new Stroke({ color: p.plotLine, width: 1 }),
    }),

    addresses(feature: FeatureLike, resolution: number): Style {
      const showLabel = resolution < 1.2; // ~zoom 18+
      const hname = String(feature.get('hname') ?? '');
      // Addresses are point features; render each as a small light-filled square
      // so it reads as a building footprint. Grow the square as we zoom in.
      const radius = resolution < 0.6 ? 7 : resolution < 1.2 ? 5.5 : 4;
      return new Style({
        image: new RegularShape({
          points: 4,
          radius,
          angle: Math.PI / 4, // flat-topped square rather than a diamond
          fill: new Fill({ color: p.addressFill }),
          stroke: new Stroke({ color: p.addressStroke, width: 1 }),
        }),
        text: showLabel && hname ? label(hname, p, '500 11px Inter, sans-serif', -12) : undefined,
      });
    },

    atoll_boundaries: new Style({
      stroke: new Stroke({ color: p.atollBoundary, width: 1.5, lineDash: [6, 4] }),
    }),

    administrative_atolls(feature: FeatureLike, resolution: number): Style {
      const name = String(feature.get('Name_Engli') ?? '');
      const showLabel = resolution > 40 && resolution < 900;
      return new Style({
        fill: new Fill({ color: p.adminFill }),
        stroke: new Stroke({ color: p.adminStroke, width: 1 }),
        text: showLabel && name ? label(name.toUpperCase(), p, '600 12px Inter, sans-serif') : undefined,
      });
    },

    airports(feature: FeatureLike): Style {
      const name = String(feature.get('Aerodrome') ?? '');
      return new Style({
        image: new Circle({
          radius: 6,
          fill: new Fill({ color: '#ff453a' }),
          stroke: new Stroke({ color: '#ffffff', width: 2 }),
        }),
        text: label(name, p, '600 11px Inter, sans-serif', -14),
      });
    },

    atoll_capitals(feature: FeatureLike): Style {
      const name = String(feature.get('islandName') ?? '');
      return new Style({
        image: new Circle({
          radius: 5,
          fill: new Fill({ color: '#ffd60a' }),
          stroke: new Stroke({ color: 'rgba(0,0,0,0.5)', width: 1 }),
        }),
        text: label(name, p, '600 11px Inter, sans-serif', -12),
      });
    },

    island_names(feature: FeatureLike, resolution: number): Style | undefined {
      // Inhabited islands label earlier than uninhabited ones to cut clutter.
      const inhabited = String(feature.get('category') ?? '') === 'Inhabited';
      const threshold = inhabited ? 300 : 90;
      if (resolution > threshold) return undefined;
      const name = String(feature.get('IslandName') ?? '');
      if (!name) return undefined;
      return new Style({
        image: new Circle({
          radius: inhabited ? 3 : 2,
          fill: new Fill({ color: inhabited ? p.addressFill : 'rgba(142,142,147,0.9)' }),
        }),
        text: label(name, p, `${inhabited ? 600 : 400} 11px Inter, sans-serif`, -9),
      });
    },
  };
}

export type StyleFns = ReturnType<typeof makeStyleFns>;
