'use client';

import 'ol/ol.css';

import Feature from 'ol/Feature';
import Map from 'ol/Map';
import View from 'ol/View';
import { GeoJSON } from 'ol/format';
import { Point, type Geometry } from 'ol/geom';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';
import VectorSource from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import { Circle, Fill, RegularShape, Stroke, Style } from 'ol/style';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { BASEMAPS, INITIAL_VIEW, UI_LAYERS } from '@/lib/map-config';
import { makeStyleFns, type StyleFns, type ThemeName } from '@/lib/map-styles';

export interface FeatureHit {
  layer: string;
  properties: Record<string, unknown>;
}

export interface MapHandle {
  flyTo: (lon: number, lat: number, zoom?: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setLayerVisible: (key: string, visible: boolean) => void;
  /** Drop a marker at a coordinate and animate to it. */
  highlight: (lon: number, lat: number, zoom?: number) => void;
  clearHighlight: () => void;
}

interface MapViewProps {
  theme: ThemeName;
  onZoomChange: (zoom: number) => void;
  onLoadingChange: (loading: boolean) => void;
  onFeatureClick: (hits: FeatureHit[], coordinate: [number, number]) => void;
}

function xyzUrls(template: string): string[] {
  // CARTO templates use {a-d} for the subdomain; expand to OL's {a-d} syntax by
  // hand since OL's XYZ wants either a single url or explicit urls array.
  const m = template.match(/\{([a-z])-([a-z])\}/);
  if (!m) return [template];
  const [full, start, end] = m;
  const urls: string[] = [];
  for (let c = start.charCodeAt(0); c <= end.charCodeAt(0); c++) {
    urls.push(template.replace(full, String.fromCharCode(c)));
  }
  return urls;
}

export const MapView = forwardRef<MapHandle, MapViewProps>(function MapView(
  { theme, onZoomChange, onLoadingChange, onFeatureClick },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const baseLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const vectorLayersRef = useRef<Map['getLayers'] extends never ? never : Record<string, VectorLayer>>(
    {} as Record<string, VectorLayer>,
  );
  const styleFnsRef = useRef<StyleFns>(makeStyleFns(theme));
  const highlightSourceRef = useRef<VectorSource | null>(null);
  const pendingLoads = useRef(0);

  // Keep the latest callbacks without re-initialising the map.
  const cbRef = useRef({ onZoomChange, onLoadingChange, onFeatureClick });
  cbRef.current = { onZoomChange, onLoadingChange, onFeatureClick };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const format = new GeoJSON();
    const vectorLayers: Record<string, VectorLayer> = {};

    const trackLoad = (delta: number) => {
      pendingLoads.current = Math.max(0, pendingLoads.current + delta);
      cbRef.current.onLoadingChange(pendingLoads.current > 0);
    };

    for (const def of UI_LAYERS) {
      let source: VectorSource;

      if (def.tiled) {
        // Tiled layers use OL's bbox loading strategy: OL asks for features in
        // the current extent and re-requests when the viewport moves outside
        // what was already loaded.
        source = new VectorSource({
          format,
          strategy: bboxStrategy,
          // OL's FeatureLoader must return void, so the async work runs in an
          // inner function and reports back through success/failure.
          loader: (extent, _resolution, projection, success, failure) => {
            const view = mapRef.current?.getView();
            if (view && (view.getZoom() ?? 0) < (def.minZoom ?? 0)) {
              success?.([]);
              return;
            }

            const [minLon, minLat, maxLon, maxLat] = transformExtent(
              extent,
              projection,
              'EPSG:4326',
            );
            const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
            trackLoad(1);
            void (async () => {
              try {
                const res = await fetch(`/api/layers?layer=${def.key}&bbox=${bbox}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                const features = format.readFeatures(json, {
                  featureProjection: projection,
                }) as Feature<Geometry>[];
                source.addFeatures(features);
                success?.(features);
              } catch {
                // A failed tile shouldn't wedge the source; OL will retry the
                // extent on the next move.
                source.removeLoadedExtent(extent);
                failure?.();
              } finally {
                trackLoad(-1);
              }
            })();
          },
        });
      } else {
        source = new VectorSource({ format });
        // Static layers load once, up front.
        trackLoad(1);
        fetch(`/api/layers?layer=${def.key}`)
          .then((r) => r.json())
          .then((json) => {
            source.addFeatures(
              format.readFeatures(json, { featureProjection: 'EPSG:3857' }) as Feature<Geometry>[],
            );
          })
          .catch(() => {})
          .finally(() => trackLoad(-1));
      }

      // A layer's style entry is either a static Style object or a
      // (feature, resolution) function. Resolve live from the ref so theme
      // swaps take effect without rebuilding the map.
      const styleFn = (feature: FeatureLikeArg, resolution: number) => {
        const entry = styleFnsRef.current[def.key as keyof StyleFns];
        return typeof entry === 'function'
          ? (entry as StyleFnCallable)(feature, resolution)
          : entry;
      };

      const layer = new VectorLayer({
        source,
        style: styleFn as never,
        declutter: def.key === 'island_names' || def.key === 'addresses',
      });
      layer.set('layerKey', def.key);
      layer.setVisible(def.defaultOn);
      vectorLayers[def.key] = layer;
    }

    vectorLayersRef.current = vectorLayers;

    const baseLayer = new TileLayer({
      source: new XYZ({ urls: xyzUrls(BASEMAPS[theme]), crossOrigin: 'anonymous' }),
    });
    baseLayerRef.current = baseLayer;

    // Top-most layer for a picked-result marker: a filled dot inside a
    // translucent ring, so a selected address stands out over any layer.
    const highlightSource = new VectorSource();
    highlightSourceRef.current = highlightSource;
    const highlightLayer = new VectorLayer({
      source: highlightSource,
      zIndex: 1000,
      style: [
        // Soft glow ring drawing the eye to the focused address.
        new Style({
          image: new Circle({
            radius: 22,
            fill: new Fill({ color: 'rgba(10,132,255,0.14)' }),
            stroke: new Stroke({ color: 'rgba(10,132,255,0.45)', width: 2 }),
          }),
        }),
        // Bold filled square matching the address markers, but larger and
        // high-contrast so the selected one clearly stands out.
        new Style({
          image: new RegularShape({
            points: 4,
            radius: 11,
            angle: Math.PI / 4,
            fill: new Fill({ color: '#0a84ff' }),
            stroke: new Stroke({ color: '#ffffff', width: 2.5 }),
          }),
        }),
      ],
    });

    const map = new Map({
      target: containerRef.current,
      layers: [baseLayer, ...UI_LAYERS.map((d) => vectorLayers[d.key]), highlightLayer],
      view: new View({
        center: fromLonLat(INITIAL_VIEW.center),
        zoom: INITIAL_VIEW.zoom,
        minZoom: INITIAL_VIEW.minZoom,
        maxZoom: INITIAL_VIEW.maxZoom,
      }),
      controls: [],
    });
    mapRef.current = map;

    const view = map.getView();
    const emitZoom = () => cbRef.current.onZoomChange(Math.round((view.getZoom() ?? 0) * 10) / 10);
    emitZoom();
    view.on('change:resolution', emitZoom);

    map.on('singleclick', (evt) => {
      const hits: FeatureHit[] = [];
      map.forEachFeatureAtPixel(
        evt.pixel,
        (feature, layer) => {
          const key = (layer?.get('layerKey') as string) ?? 'unknown';
          hits.push({ layer: key, properties: (feature as Feature).getProperties() });
        },
        { hitTolerance: 4 },
      );
      // Drop the geometry object from the properties before handing upward.
      const clean = hits.map((h) => {
        const { geometry, ...rest } = h.properties as Record<string, unknown>;
        void geometry;
        return { layer: h.layer, properties: rest };
      });
      const [lon, lat] = toLonLat(evt.coordinate);
      cbRef.current.onFeatureClick(clean, [lon, lat]);
    });

    map.on('pointermove', (evt) => {
      if (evt.dragging) return;
      const hit = map.hasFeatureAtPixel(evt.pixel, { hitTolerance: 4 });
      map.getTargetElement().style.cursor = hit ? 'pointer' : '';
    });

    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to theme changes: swap basemap and restyle every vector layer.
  useEffect(() => {
    styleFnsRef.current = makeStyleFns(theme);
    baseLayerRef.current?.setSource(
      new XYZ({ urls: xyzUrls(BASEMAPS[theme]), crossOrigin: 'anonymous' }),
    );
    for (const layer of Object.values(vectorLayersRef.current)) {
      layer.changed();
    }
  }, [theme]);

  useImperativeHandle(ref, () => ({
    flyTo(lon, lat, zoom) {
      const view = mapRef.current?.getView();
      view?.animate({
        center: fromLonLat([lon, lat]),
        zoom: zoom ?? Math.max(view.getZoom() ?? 0, 18),
        duration: 600,
      });
    },
    zoomIn() {
      const view = mapRef.current?.getView();
      view?.animate({ zoom: (view.getZoom() ?? 0) + 1, duration: 200 });
    },
    zoomOut() {
      const view = mapRef.current?.getView();
      view?.animate({ zoom: (view.getZoom() ?? 0) - 1, duration: 200 });
    },
    setLayerVisible(key, visible) {
      vectorLayersRef.current[key]?.setVisible(visible);
    },
    highlight(lon, lat, zoom) {
      const source = highlightSourceRef.current;
      if (!source) return;
      source.clear();
      source.addFeature(new Feature({ geometry: new Point(fromLonLat([lon, lat])) }));
      const view = mapRef.current?.getView();
      view?.animate({
        center: fromLonLat([lon, lat]),
        zoom: zoom ?? Math.max(view.getZoom() ?? 0, 18),
        duration: 600,
      });
    },
    clearHighlight() {
      highlightSourceRef.current?.clear();
    },
  }));

  return <div ref={containerRef} className="absolute inset-0" />;
});

// OL's style-function signature is loosely typed; these aliases keep the call
// site readable without leaking `any`.
type FeatureLikeArg = Parameters<NonNullable<StyleFns['parcels']>>[0];
type StyleFnCallable = (feature: FeatureLikeArg, resolution: number) => unknown;
