/**
 * Single source of truth for the map layers.
 *
 * Each entry maps a database column to the property key the original
 * raajje.app API emitted. The importer reads this mapping left-to-right
 * (property -> column) and the API reads it right-to-left (column -> property),
 * so the wire format stays byte-compatible with the site this clones while the
 * storage layer keeps a normal relational schema.
 */

export type ColumnType = 'string' | 'number' | 'int';

export interface ColumnMap {
  /** Column name in the database. */
  column: string;
  /** Property key as it appears in the GeoJSON `properties` object. */
  prop: string;
  type: ColumnType;
  /**
   * Optional re-formatter applied on the way out. Used where upstream emits a
   * numeric value as a formatted string and the frontend depends on that shape.
   */
  emit?: (value: unknown) => unknown;
}

export interface LayerDef {
  key: string;
  table: string;
  label: string;
  /** GeoJSON geometry type, for reference and validation. */
  geometry: 'Point' | 'Polygon' | 'MultiPolygon' | 'MultiLineString';
  /** Tiled layers require a bbox and are served per-viewport. */
  tiled: boolean;
  /** Minimum map zoom at which a tiled layer is requested. */
  minZoom?: number;
  /** Hard cap on features returned per request, matching upstream behaviour. */
  limit?: number;
  columns: ColumnMap[];
}

const s = (column: string, prop: string): ColumnMap => ({ column, prop, type: 'string' });
const n = (column: string, prop: string): ColumnMap => ({ column, prop, type: 'number' });
const i = (column: string, prop: string): ColumnMap => ({ column, prop, type: 'int' });

export const LAYERS: LayerDef[] = [
  {
    key: 'atoll_boundaries',
    table: 'atoll_boundaries',
    label: 'Atoll Boundary',
    geometry: 'MultiLineString',
    tiled: false,
    columns: [
      s('feature_id', 'feature_id'),
      s('name', 'name'),
      s('objectid', 'OBJECTID'),
      n('shape_leng', 'SHAPE_Leng'),
      n('shape_le_1', 'Shape_Le_1'),
    ],
  },
  {
    key: 'administrative_atolls',
    table: 'administrative_atolls',
    label: 'Admin Atoll',
    geometry: 'MultiPolygon',
    tiled: false,
    columns: [
      s('feature_id', 'feature_id'),
      s('code_abbrev', 'codeAbbrev'),
      s('name_english', 'Name_Engli'),
      s('name_official', 'Name_Offic'),
      s('name_capital', 'Name_Capit'),
      s('code_name', 'CodeName'),
      s('latin_code', 'LatinCode'),
      s('thaana_code', 'ThaanaCode'),
      s('city_status', 'cityStatus'),
      i('atoll_code', 'atollCode'),
      n('shape_leng', 'Shape_Leng'),
      n('shape_area', 'Shape_Area'),
      s('v01', 'V01'),
      s('v02', 'V02'),
      s('v03', 'V03'),
      s('v04', 'V04'),
      s('v07', 'V07'),
      n('tot_per', 'totPer'),
      n('frg_per', 'frgPer'),
      n('mld_perc', 'mldPerc'),
      n('pgrow_perc', 'pgrowPerc'),
    ],
  },
  {
    key: 'airports',
    table: 'airports',
    label: 'Airports',
    geometry: 'Point',
    tiled: false,
    columns: [
      s('feature_id', 'feature_id'),
      s('aerodrome', 'Aerodrome'),
      s('operator', 'Aerodrome_'),
      s('code', 'Code'),
      s('icao', 'Four_Lette'),
      s('iata', 'Three_lett'),
      s('international', 'Internatio'),
      s('longitude', 'longitude'),
      s('latitude', 'latitude'),
      s('x', 'x'),
      s('y', 'y'),
      n('lat', 'lat'),
      n('lon', 'long_'),
    ],
  },
  {
    key: 'atoll_capitals',
    table: 'atoll_capitals',
    label: 'Atoll Capitals',
    geometry: 'Point',
    tiled: false,
    columns: [
      s('feature_id', 'feature_id'),
      s('name', 'Name'),
      s('atoll', 'atoll'),
      s('island_name', 'islandName'),
      s('longitude', 'longitude'),
      s('latitude', 'latitude'),
      s('v01', 'V01'),
      s('v02', 'V02'),
      s('v03', 'V03'),
    ],
  },
  {
    key: 'island_names',
    table: 'island_names',
    label: 'Island Names',
    geometry: 'Point',
    tiled: false,
    columns: [
      s('feature_id', 'feature_id'),
      s('island_name', 'IslandName'),
      s('atoll', 'Atoll'),
      s('longitude', 'longitude'),
      s('latitude', 'latitude'),
      s('objectid', 'OBJECTID'),
      s('fcode', 'FCODE'),
      s('island_code', 'islandCode'),
      s('v01', 'v01'),
      s('v02', 'v02'),
      s('v03', 'v03'),
      s('v04', 'v04'),
      s('v07', 'v07'),
      s('category', 'category'),
      s('categ2', 'categ2'),
      s('capital', 'capital'),
      s('fname', 'fname'),
      s('orig_fid', 'ORIG_FID'),
    ],
  },
  {
    key: 'parcels',
    table: 'parcels',
    label: 'Parcels',
    geometry: 'MultiPolygon',
    tiled: true,
    minZoom: 16,
    limit: 4000,
    columns: [
      s('feature_id', 'feature_id'),
      s('category', 'Category'),
      // Upstream serialises this as a fixed 6-decimal string, not a number.
      { ...n('shape_area', 'Shape_Area'), emit: (v) => (v === null ? null : Number(v).toFixed(6)) },
    ],
  },
  {
    key: 'house_parcels',
    table: 'house_parcels',
    label: 'House Parcels',
    geometry: 'Polygon',
    tiled: true,
    minZoom: 17,
    limit: 4000,
    columns: [
      s('feature_id', 'feature_id'),
      s('hname', 'hname'),
      s('category', 'Category'),
      i('src_id', 'id'),
      s('block_code', 'block_code'),
      s('fcode', 'fcode'),
      n('area_sqm', 'area_sqm'),
      n('area_sqft', 'area_sqft'),
      s('type', 'type'),
    ],
  },
  {
    key: 'plot_lines',
    table: 'plot_lines',
    label: 'Plot Lines',
    geometry: 'MultiLineString',
    tiled: true,
    minZoom: 17,
    limit: 4000,
    columns: [
      s('feature_id', 'feature_id'),
      s('block_code', 'block_code'),
      s('fcode', 'fcode'),
    ],
  },
  {
    key: 'addresses',
    table: 'addresses',
    label: 'Addresses',
    geometry: 'Point',
    tiled: true,
    minZoom: 18,
    limit: 4000,
    columns: [
      s('feature_id', 'feature_id'),
      s('hname', 'hname'),
      s('island_name', 'IslandName'),
      s('atoll', 'Atoll'),
      s('hfname', 'hfname'),
    ],
  },
];

export const LAYER_BY_KEY = new Map(LAYERS.map((l) => [l.key, l]));

export const TILED_LAYER_KEYS = LAYERS.filter((l) => l.tiled).map((l) => l.key);
export const STATIC_LAYER_KEYS = LAYERS.filter((l) => !l.tiled).map((l) => l.key);

/** `Shape_Area` on parcels is a string upstream; keep number columns numeric but
 *  emit the original textual shape where the source did. */
export function coerceForColumn(value: unknown, type: ColumnType): unknown {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'string') return String(value);
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return type === 'int' ? Math.trunc(num) : num;
}
