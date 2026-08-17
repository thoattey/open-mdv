'use client';

import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { FeatureSheet } from '@/components/map/feature-sheet';
import { HeaderActions, InfoBar, Logo, ZoomControls } from '@/components/map/map-chrome';
import type { FeatureHit, MapHandle } from '@/components/map/map-view';
import { LayerPanel } from '@/components/map/layer-panel';
import { LoadingOverlay } from '@/components/map/loading-overlay';
import {
  SearchBox,
  type AddressResult,
  type IslandResult,
  type ResidentResult,
} from '@/components/map/search-box';
import { useTheme } from '@/components/theme-provider';
import { UI_LAYERS } from '@/lib/map-config';

// OpenLayers touches `window` at import time, so the map must be client-only.
const MapView = dynamic(() => import('@/components/map/map-view').then((m) => m.MapView), {
  ssr: false,
});

const DEFAULT_VISIBILITY = Object.fromEntries(UI_LAYERS.map((l) => [l.key, l.defaultOn]));

/** Feature properties arrive loosely typed; keep only non-blank text. */
function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

export default function Page() {
  const { theme, toggle } = useTheme();
  const mapRef = useRef<MapHandle>(null);

  const [zoom, setZoom] = useState(11);
  const [loading, setLoading] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [visibility, setVisibility] = useState<Record<string, boolean>>(DEFAULT_VISIBILITY);
  const [hits, setHits] = useState<FeatureHit[] | null>(null);
  const [clickCoord, setClickCoord] = useState<[number, number] | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [addressResidents, setAddressResidents] = useState<ResidentResult[] | null>(null);
  const [residentsLoading, setResidentsLoading] = useState(false);
  // Guards against a slow lookup for a previously picked address landing after
  // the user has already picked another one.
  const residentsReq = useRef(0);

  const handleToggleLayer = useCallback((key: string, value: boolean) => {
    setVisibility((prev) => ({ ...prev, [key]: value }));
    mapRef.current?.setLayerVisible(key, value);
  }, []);

  /** Drop any address resident list, discarding a lookup still in flight. */
  const clearResidents = useCallback(() => {
    residentsReq.current++;
    setAddressResidents(null);
    setResidentsLoading(false);
  }, []);

  /** Everyone registered at a house name, narrowed by island/atoll when known. */
  const loadResidents = useCallback(
    async (hname: string, island?: string | null, atoll?: string | null) => {
      const req = ++residentsReq.current;
      setAddressResidents(null);
      setResidentsLoading(true);

      const params = new URLSearchParams({ hname });
      if (island) params.set('island', island);
      if (atoll) params.set('atoll', atoll);

      try {
        const data = await fetch(`/api/address-residents?${params}`).then((r) => r.json());
        if (req !== residentsReq.current) return;
        setAddressResidents(data.results ?? []);
      } catch {
        if (req !== residentsReq.current) return;
        setAddressResidents([]);
      } finally {
        if (req === residentsReq.current) setResidentsLoading(false);
      }
    },
    [],
  );

  const handleFeatureClick = useCallback(
    (newHits: FeatureHit[], coord: [number, number]) => {
      // A click on an address point usually also hits the parcel and plot lines
      // underneath it. The address is the record the user aimed at, so it leads
      // the panel — and, as in search, it brings its resident list with it.
      const address = newHits.find((h) => h.layer === 'addresses');
      const ordered = address ? [address, ...newHits.filter((h) => h !== address)] : newHits;

      setHits(ordered.length ? ordered : null);
      setClickCoord(coord);
      setLocationNote(null);
      mapRef.current?.clearHighlight();

      const hname = text(address?.properties.hname);
      if (hname) {
        void loadResidents(hname, text(address!.properties.IslandName), text(address!.properties.Atoll));
      } else {
        clearResidents();
      }
    },
    [clearResidents, loadResidents],
  );

  const handlePickIsland = useCallback(
    (island: IslandResult) => {
      mapRef.current?.flyTo(island.lon, island.lat, 14);
      mapRef.current?.highlight(island.lon, island.lat, 14);
      clearResidents();
      setMobileSearchOpen(false);
    },
    [clearResidents],
  );

  const handlePickAddress = useCallback(
    (address: AddressResult) => {
      mapRef.current?.highlight(address.lon, address.lat, 18);
      setHits([
        {
          layer: 'addresses',
          properties: { hname: address.hname, IslandName: address.island, Atoll: address.atoll },
        },
      ]);
      setClickCoord([address.lon, address.lat]);
      setLocationNote(null);
      setMobileSearchOpen(false);

      // Then list everyone registered at that address.
      void loadResidents(address.hname, address.island, address.atoll);
    },
    [loadResidents],
  );

  const handlePickResident = useCallback(
    async (resident: ResidentResult) => {
      // Surface the record immediately, including the ID number.
      setHits([{ layer: 'resident', properties: { ...resident } }]);
      setClickCoord(null);
      setLocationNote(null);
      clearResidents();
      setMobileSearchOpen(false);

      // Resolve the permanent address to a point and fly/highlight it. The record
      // itself has no geometry, so this is a best-effort lookup in the address
      // layer, falling back to the island.
      const params = new URLSearchParams();
      if (resident.permanent_address) params.set('hname', resident.permanent_address);
      if (resident.island) params.set('island', resident.island);

      try {
        const geo = await fetch(`/api/geocode-address?${params}`).then((r) => r.json());
        if (geo.found) {
          mapRef.current?.highlight(geo.lon, geo.lat, geo.match === 'island' ? 15 : 18);
          setClickCoord([geo.lon, geo.lat]);
          setLocationNote(
            geo.match === 'exact'
              ? 'Location matched to address'
              : geo.match === 'fuzzy'
                ? 'Approximate — nearest matching house name'
                : 'Approximate — island location',
          );
        } else {
          setLocationNote('No map location found for this address');
        }
      } catch {
        setLocationNote('Could not resolve address location');
      }
    },
    [clearResidents],
  );

  const handleCloseSheet = useCallback(() => {
    setHits(null);
    setLocationNote(null);
    clearResidents();
    mapRef.current?.clearHighlight();
  }, [clearResidents]);

  const header = useMemo(
    () => (
      <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center gap-3 p-3">
        <div className="pointer-events-auto">
          <Logo />
        </div>
        <div className="pointer-events-auto mx-auto hidden w-full max-w-md md:block">
          <SearchBox
            onPickIsland={handlePickIsland}
            onPickResident={handlePickResident}
            onPickAddress={handlePickAddress}
          />
        </div>
        <div className="pointer-events-auto ml-auto">
          <HeaderActions
            theme={theme}
            onToggleTheme={toggle}
            onToggleLayers={() => setLayersOpen((v) => !v)}
            onOpenMobileSearch={() => setMobileSearchOpen(true)}
          />
        </div>
      </header>
    ),
    [theme, toggle, handlePickIsland, handlePickResident, handlePickAddress],
  );

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <MapView
        ref={mapRef}
        theme={theme}
        onZoomChange={setZoom}
        onLoadingChange={setLoading}
        onFeatureClick={handleFeatureClick}
      />

      {header}

      <LayerPanel
        open={layersOpen}
        onClose={() => setLayersOpen(false)}
        visibility={visibility}
        onToggle={handleToggleLayer}
      />

      <ZoomControls
        zoom={zoom}
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
      />

      <InfoBar zoom={zoom} />

      <FeatureSheet
        hits={hits}
        coordinate={clickCoord}
        locationNote={locationNote}
        residents={addressResidents}
        residentsLoading={residentsLoading}
        onClose={handleCloseSheet}
      />

      <LoadingOverlay visible={loading} />

      {/* Mobile full-screen search */}
      {mobileSearchOpen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-background/95 p-3 backdrop-blur-md md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SearchBox
                autoFocus
                onPickIsland={handlePickIsland}
                onPickResident={handlePickResident}
                onPickAddress={handlePickAddress}
              />
            </div>
            <button
              onClick={() => setMobileSearchOpen(false)}
              className="glass flex size-9 items-center justify-center rounded-full"
              aria-label="Close search"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
