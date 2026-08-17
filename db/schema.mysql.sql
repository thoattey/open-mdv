-- Raajje Atlas — MySQL 8.0+ schema
--
-- Geometry is stored with SRID 0 in (longitude, latitude) order rather than
-- SRID 4326. MySQL treats 4326 as a geographic CRS with latitude-first axis
-- order, which would mean flipping every coordinate on the way in and out for
-- no benefit — every query here is a planar bounding-box test. SRID 0 keeps the
-- data in the same axis order as the GeoJSON it came from.
--
-- SPATIAL INDEX requires the column to be NOT NULL.

CREATE TABLE IF NOT EXISTS atoll_boundaries (
  id           INT UNSIGNED PRIMARY KEY,
  feature_id   VARCHAR(32),
  name         VARCHAR(255),
  objectid     VARCHAR(32),
  shape_leng   DOUBLE,
  shape_le_1   DOUBLE,
  geom         GEOMETRY NOT NULL SRID 0,
  SPATIAL INDEX sx_atoll_boundaries (geom)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS administrative_atolls (
  id            INT UNSIGNED PRIMARY KEY,
  feature_id    VARCHAR(32),
  code_abbrev   VARCHAR(16),
  name_english  VARCHAR(255),
  name_official VARCHAR(255),
  name_capital  VARCHAR(255),
  code_name     VARCHAR(255),
  latin_code    VARCHAR(16),
  thaana_code   VARCHAR(16),
  city_status   VARCHAR(64),
  atoll_code    INT,
  shape_leng    DOUBLE,
  shape_area    DOUBLE,
  v01           VARCHAR(32),
  v02           VARCHAR(32),
  v03           VARCHAR(32),
  v04           VARCHAR(32),
  v07           VARCHAR(32),
  tot_per       DOUBLE,
  frg_per       DOUBLE,
  mld_perc      DOUBLE,
  pgrow_perc    DOUBLE,
  geom          GEOMETRY NOT NULL SRID 0,
  SPATIAL INDEX sx_administrative_atolls (geom),
  KEY ix_admin_atolls_abbrev (code_abbrev)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS airports (
  id            INT UNSIGNED PRIMARY KEY,
  feature_id    VARCHAR(32),
  aerodrome     VARCHAR(255),
  operator      VARCHAR(255),
  code          VARCHAR(16),
  icao          VARCHAR(16),
  iata          VARCHAR(16),
  international VARCHAR(8),
  longitude     VARCHAR(32),
  latitude      VARCHAR(32),
  x             VARCHAR(32),
  y             VARCHAR(32),
  lat           DOUBLE,
  lon           DOUBLE,
  geom          GEOMETRY NOT NULL SRID 0,
  SPATIAL INDEX sx_airports (geom)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS atoll_capitals (
  id          INT UNSIGNED PRIMARY KEY,
  feature_id  VARCHAR(32),
  name        VARCHAR(255),
  atoll       VARCHAR(64),
  island_name VARCHAR(255),
  longitude   VARCHAR(32),
  latitude    VARCHAR(32),
  v01         VARCHAR(32),
  v02         VARCHAR(32),
  v03         VARCHAR(32),
  geom        GEOMETRY NOT NULL SRID 0,
  SPATIAL INDEX sx_atoll_capitals (geom)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS island_names (
  id          INT UNSIGNED PRIMARY KEY,
  feature_id  VARCHAR(32),
  island_name VARCHAR(255),
  atoll       VARCHAR(64),
  longitude   VARCHAR(32),
  latitude    VARCHAR(32),
  objectid    VARCHAR(32),
  fcode       VARCHAR(32),
  island_code VARCHAR(32),
  v01         VARCHAR(32),
  v02         VARCHAR(32),
  v03         VARCHAR(32),
  v04         VARCHAR(32),
  v07         VARCHAR(32),
  category    VARCHAR(64),
  categ2      VARCHAR(64),
  capital     VARCHAR(8),
  fname       VARCHAR(255),
  orig_fid    VARCHAR(32),
  geom        GEOMETRY NOT NULL SRID 0,
  SPATIAL INDEX sx_island_names (geom),
  KEY ix_island_names_name (island_name),
  KEY ix_island_names_atoll (atoll)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS parcels (
  id         INT UNSIGNED PRIMARY KEY,
  feature_id VARCHAR(32),
  category   VARCHAR(64),
  shape_area DOUBLE,
  geom       GEOMETRY NOT NULL SRID 0,
  SPATIAL INDEX sx_parcels (geom),
  KEY ix_parcels_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS house_parcels (
  id         INT UNSIGNED PRIMARY KEY,
  feature_id VARCHAR(32),
  hname      VARCHAR(255),
  category   VARCHAR(64),
  src_id     BIGINT,
  block_code VARCHAR(64),
  fcode      VARCHAR(64),
  area_sqm   DOUBLE,
  area_sqft  DOUBLE,
  type       VARCHAR(64),
  geom       GEOMETRY NOT NULL SRID 0,
  SPATIAL INDEX sx_house_parcels (geom),
  KEY ix_house_parcels_hname (hname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS plot_lines (
  id         INT UNSIGNED PRIMARY KEY,
  feature_id VARCHAR(32),
  block_code VARCHAR(64),
  fcode      VARCHAR(64),
  geom       GEOMETRY NOT NULL SRID 0,
  SPATIAL INDEX sx_plot_lines (geom)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS addresses (
  id          INT UNSIGNED PRIMARY KEY,
  feature_id  VARCHAR(32),
  hname       VARCHAR(255),
  island_name VARCHAR(255),
  atoll       VARCHAR(64),
  hfname      VARCHAR(512),
  geom        GEOMETRY NOT NULL SRID 0,
  SPATIAL INDEX sx_addresses (geom),
  KEY ix_addresses_hname (hname),
  KEY ix_addresses_island (island_name),
  KEY ix_addresses_hname_island (hname, island_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Directory of people, used by the resident search box.
--
-- The upstream site exposes a live national ID register here. This clone ships
-- SYNTHETIC records only (see scripts/seed-residents.mjs) — no real personal
-- data is scraped, stored, or served.
CREATE TABLE IF NOT EXISTS residents (
  id_no             VARCHAR(32) PRIMARY KEY,
  full_name         VARCHAR(255) NOT NULL,
  dob               VARCHAR(32),
  gender            CHAR(1),
  permanent_address VARCHAR(255),
  island            VARCHAR(255),
  atoll             VARCHAR(64),
  -- Set from /admin (the data-control console). Every public read filters it
  -- out, so a censored resident disappears from search, the grid and the map's
  -- address sheet without the row being deleted.
  is_censored       TINYINT(1) NOT NULL DEFAULT 0,
  KEY ix_residents_name (full_name),
  KEY ix_residents_censored (is_censored),
  KEY ix_residents_address (permanent_address),
  KEY ix_residents_island (island),
  FULLTEXT KEY ft_residents (full_name, permanent_address, island)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Registry of businesses, used by the /business console.
--
-- Unlike `residents`, this is public-record data: the national business registry
-- publishes every row of it, including the officers listed in `business_owners`.
-- Rows arrive through the batch importer in /admin (see
-- src/lib/business-import.ts), never from a scraper on a schedule.
--
-- `id` is a natural key derived from the source record — the registration number
-- when there is one, else the UPN, else a slug of the name — so re-importing an
-- overlapping export updates rows in place instead of duplicating them.
CREATE TABLE IF NOT EXISTS businesses (
  id              VARCHAR(128) PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  type            VARCHAR(128),
  status          VARCHAR(128),
  registration_no VARCHAR(128),
  detail_url      VARCHAR(1024),
  upn             VARCHAR(128),
  address         VARCHAR(512),
  owner_entity    VARCHAR(255),
  -- When this row was last written by an import, shown in the console readout.
  imported_at     DATETIME NULL,
  KEY ix_businesses_name (name),
  KEY ix_businesses_type (type),
  KEY ix_businesses_status (status),
  KEY ix_businesses_reg (registration_no),
  KEY ix_businesses_upn (upn),
  FULLTEXT KEY ft_businesses (name, address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Officers of a business, in the order the source record listed them.
--
-- `ordinal` is part of the key rather than a bare sequence so an import is
-- idempotent: the same source record always writes the same primary keys, and
-- officers dropped from a later export are deleted by `ordinal >= <new count>`.
CREATE TABLE IF NOT EXISTS business_owners (
  id           VARCHAR(160) PRIMARY KEY,
  business_id  VARCHAR(128) NOT NULL,
  ordinal      INT NOT NULL,
  owner_name   VARCHAR(255) NOT NULL,
  owner_role   VARCHAR(255),
  appointed_on VARCHAR(32),
  KEY ix_business_owners_business (business_id),
  KEY ix_business_owners_name (owner_name),
  CONSTRAINT fk_business_owners_business
    FOREIGN KEY (business_id) REFERENCES businesses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
