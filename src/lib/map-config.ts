/**
 * Client-side map configuration: layer visibility metadata, zoom thresholds and
 * basemap sources. Kept framework-free so both the map component and the layer
 * panel can import it.
 */

export interface UiLayer {
  key: string;
  label: string;
  icon: string; // lucide icon name
  /** Whether the layer is rendered from the DB per-viewport (tiled) or once. */
  tiled: boolean;
  /** Zoom at or above which a tiled layer is fetched. */
  minZoom?: number;
  defaultOn: boolean;
}

/** Order matches the original viewer's layer panel. */
export const UI_LAYERS: UiLayer[] = [
  { key: 'addresses', label: 'Addresses', icon: 'MapPin', tiled: true, minZoom: 18, defaultOn: true },
  { key: 'parcels', label: 'Parcels', icon: 'Vector', tiled: true, minZoom: 16, defaultOn: true },
  { key: 'house_parcels', label: 'House Parcels', icon: 'House', tiled: true, minZoom: 17, defaultOn: true },
  { key: 'plot_lines', label: 'Plot Lines', icon: 'Grid2x2', tiled: true, minZoom: 17, defaultOn: true },
  { key: 'atoll_boundaries', label: 'Atoll Boundary', icon: 'Spline', tiled: false, defaultOn: true },
  { key: 'administrative_atolls', label: 'Admin Atoll', icon: 'Map', tiled: false, defaultOn: true },
  { key: 'airports', label: 'Airports', icon: 'Plane', tiled: false, defaultOn: true },
  { key: 'atoll_capitals', label: 'Atoll Capitals', icon: 'Star', tiled: false, defaultOn: true },
  { key: 'island_names', label: 'Island Names', icon: 'Tag', tiled: false, defaultOn: true },
];

export const BASEMAPS = {
  dark:
    process.env.NEXT_PUBLIC_TILE_URL_DARK ??
    'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light:
    process.env.NEXT_PUBLIC_TILE_URL_LIGHT ??
    'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};

/** Initial view: centred on Malé at a country-wide zoom. */
export const INITIAL_VIEW = {
  center: [73.51, 4.175] as [number, number], // lon, lat
  zoom: 11,
  minZoom: 6,
  maxZoom: 20,
};

export const PARCEL_MIN_ZOOM = 16;
export const ADDRESS_MIN_ZOOM = 18;
