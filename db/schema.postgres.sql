-- MDV Map Viewer — PostgreSQL + PostGIS schema
--
-- Mirror of db/schema.mysql.sql. Unlike MySQL, PostGIS uses longitude-first
-- axis order for SRID 4326, so geometries are stored as true 4326 and bbox
-- filtering uses the `&&` operator against ST_MakeEnvelope, which is index-backed
-- by GIST.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS atoll_boundaries (
  id           INTEGER PRIMARY KEY,
  feature_id   TEXT,
  name         TEXT,
  objectid     TEXT,
  shape_leng   DOUBLE PRECISION,
  shape_le_1   DOUBLE PRECISION,
  geom         geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS sx_atoll_boundaries ON atoll_boundaries USING GIST (geom);

CREATE TABLE IF NOT EXISTS administrative_atolls (
  id            INTEGER PRIMARY KEY,
  feature_id    TEXT,
  code_abbrev   TEXT,
  name_english  TEXT,
  name_official TEXT,
  name_capital  TEXT,
  code_name     TEXT,
  latin_code    TEXT,
  thaana_code   TEXT,
  city_status   TEXT,
  atoll_code    INTEGER,
  shape_leng    DOUBLE PRECISION,
  shape_area    DOUBLE PRECISION,
  v01           TEXT,
  v02           TEXT,
  v03           TEXT,
  v04           TEXT,
  v07           TEXT,
  tot_per       DOUBLE PRECISION,
  frg_per       DOUBLE PRECISION,
  mld_perc      DOUBLE PRECISION,
  pgrow_perc    DOUBLE PRECISION,
  geom          geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS sx_administrative_atolls ON administrative_atolls USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_admin_atolls_abbrev ON administrative_atolls (code_abbrev);

CREATE TABLE IF NOT EXISTS airports (
  id            INTEGER PRIMARY KEY,
  feature_id    TEXT,
  aerodrome     TEXT,
  operator      TEXT,
  code          TEXT,
  icao          TEXT,
  iata          TEXT,
  international TEXT,
  longitude     TEXT,
  latitude      TEXT,
  x             TEXT,
  y             TEXT,
  lat           DOUBLE PRECISION,
  lon           DOUBLE PRECISION,
  geom          geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS sx_airports ON airports USING GIST (geom);

CREATE TABLE IF NOT EXISTS atoll_capitals (
  id          INTEGER PRIMARY KEY,
  feature_id  TEXT,
  name        TEXT,
  atoll       TEXT,
  island_name TEXT,
  longitude   TEXT,
  latitude    TEXT,
  v01         TEXT,
  v02         TEXT,
  v03         TEXT,
  geom        geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS sx_atoll_capitals ON atoll_capitals USING GIST (geom);

CREATE TABLE IF NOT EXISTS island_names (
  id          INTEGER PRIMARY KEY,
  feature_id  TEXT,
  island_name TEXT,
  atoll       TEXT,
  longitude   TEXT,
  latitude    TEXT,
  objectid    TEXT,
  fcode       TEXT,
  island_code TEXT,
  v01         TEXT,
  v02         TEXT,
  v03         TEXT,
  v04         TEXT,
  v07         TEXT,
  category    TEXT,
  categ2      TEXT,
  capital     TEXT,
  fname       TEXT,
  orig_fid    TEXT,
  geom        geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS sx_island_names ON island_names USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_island_names_name ON island_names (island_name);
CREATE INDEX IF NOT EXISTS ix_island_names_atoll ON island_names (atoll);

CREATE TABLE IF NOT EXISTS parcels (
  id         INTEGER PRIMARY KEY,
  feature_id TEXT,
  category   TEXT,
  shape_area DOUBLE PRECISION,
  geom       geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS sx_parcels ON parcels USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_parcels_category ON parcels (category);

CREATE TABLE IF NOT EXISTS house_parcels (
  id         INTEGER PRIMARY KEY,
  feature_id TEXT,
  hname      TEXT,
  category   TEXT,
  src_id     BIGINT,
  block_code TEXT,
  fcode      TEXT,
  area_sqm   DOUBLE PRECISION,
  area_sqft  DOUBLE PRECISION,
  type       TEXT,
  geom       geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS sx_house_parcels ON house_parcels USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_house_parcels_hname ON house_parcels (hname);

CREATE TABLE IF NOT EXISTS plot_lines (
  id         INTEGER PRIMARY KEY,
  feature_id TEXT,
  block_code TEXT,
  fcode      TEXT,
  geom       geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS sx_plot_lines ON plot_lines USING GIST (geom);

CREATE TABLE IF NOT EXISTS addresses (
  id          INTEGER PRIMARY KEY,
  feature_id  TEXT,
  hname       TEXT,
  island_name TEXT,
  atoll       TEXT,
  hfname      TEXT,
  geom        geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS sx_addresses ON addresses USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_addresses_hname ON addresses (hname);
CREATE INDEX IF NOT EXISTS ix_addresses_island ON addresses (island_name);
CREATE INDEX IF NOT EXISTS ix_addresses_hname_island ON addresses (hname, island_name);

-- Directory of people, used by the resident search box.
--
-- The upstream site exposes a live national ID register here. This clone ships
-- SYNTHETIC records only (see scripts/seed-residents.mjs) — no real personal
-- data is scraped, stored, or served.
CREATE TABLE IF NOT EXISTS residents (
  id_no             TEXT PRIMARY KEY,
  full_name         TEXT NOT NULL,
  dob               TEXT,
  gender            CHAR(1),
  permanent_address TEXT,
  island            TEXT,
  atoll             TEXT
);
CREATE INDEX IF NOT EXISTS ix_residents_name ON residents (full_name);
CREATE INDEX IF NOT EXISTS ix_residents_address ON residents (permanent_address);
CREATE INDEX IF NOT EXISTS ix_residents_island ON residents (island);
CREATE INDEX IF NOT EXISTS ix_residents_search ON residents
  USING GIN (to_tsvector('simple', full_name || ' ' || coalesce(permanent_address, '') || ' ' || coalesce(island, '')));
