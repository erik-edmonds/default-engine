-- The scan registry, and the provenance of every annotation run against it.
--
-- THE FIRST MIGRATION IN THIS REPO. Before this there was a `pg.Pool` and one
-- health route and no schema at all, so this file also establishes the
-- convention: numbered, forward-only, idempotent, applied by
-- `scripts/migrate.ts` and recorded in `schema_migrations`.
--
-- WHAT THIS IS FOR. Phase 2 annotates point clouds with PDAL and writes a
-- DERIVED COPC beside the source. The per-point payload lives in that file --
-- it is 10.6M points, and the viewer's whole fetch/decode/LOD path is already
-- built to stream exactly that. What Postgres holds is everything a file
-- cannot: which scans exist, which pipeline produced which derivative, with
-- what parameters, when, and what came out. For an annotation and QA service
-- that audit trail is a substantial part of the product.

create table if not exists schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

-- THE TABLE config/scans.ts HAS BEEN A PLACEHOLDER FOR SINCE IT WAS WRITTEN.
-- Its own comment says so: "A hard-coded table, and the seam where a database
-- goes later: when scans are uploaded and processed, this lookup becomes a
-- query and nothing else in the viewer moves."
create table if not exists scans (
  id               text primary key,
  label            text not null,
  credit           text not null,
  -- The raw survey, as delivered.
  source_url       text not null,
  -- The annotated derivative, once a pipeline run has produced one. NULL
  -- until then, and the viewer falls back to source_url -- which is why the
  -- un-annotated case has to render correctly rather than being an error.
  derived_url      text,
  -- Metres per file unit: 1 for a metric survey, 0.3048 for one in feet.
  -- READ FROM THE FILE'S OWN WKT, never guessed. It is the conversion both
  -- the viewer's height ramp and the pipeline's agronomic thresholds depend
  -- on, and getting it wrong is wrong by 3.28x while looking entirely
  -- plausible.
  units_to_metres  double precision not null default 1,
  approx_points    bigint not null default 0,
  created_at       timestamptz not null default now()
);

-- One row per PDAL invocation, successful or not.
create table if not exists pipeline_runs (
  id            bigserial primary key,
  scan_id       text not null references scans(id) on delete cascade,
  -- The exact `pdal --version`, because the pipeline's behaviour depends on
  -- it: `extra_dims` on writers.copc did not exist before 2.7.0, and
  -- filters.hag_nn's `allow_extrapolation` default differs between the
  -- documentation and the source. A run that cannot name its PDAL cannot be
  -- reproduced.
  pdal_version  text not null,
  -- The generated pipeline, stored verbatim. The thresholds are computed from
  -- the scan's units, so the JSON is the only complete record of what was
  -- actually asked for.
  pipeline      jsonb not null,
  status        text not null default 'running'
                  check (status in ('running', 'ok', 'failed')),
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index if not exists pipeline_runs_scan_idx on pipeline_runs (scan_id, started_at desc);

-- What the run produced, over EVERY point in the file.
--
-- Distinct from what the viewer's readout shows, which is over the resident
-- set at the current budget and camera and therefore changes as you look
-- around. Percentiles in particular belong here and not there: a percentile
-- cannot be combined from per-node summaries, so the only honest place to
-- compute one is the pipeline, which sees the whole file at once.
create table if not exists scan_stats (
  run_id           bigint primary key references pipeline_runs(id) on delete cascade,
  point_count      bigint not null,
  -- ASPRS code -> count, as an object. Sparse, because most of the 256
  -- possible codes never appear.
  class_histogram  jsonb not null,
  -- IN METRES, converted once here, so nothing downstream has to know the
  -- file was in feet.
  hag_p50_m        double precision,
  hag_p95_m        double precision,
  hag_max_m        double precision,
  ground_fraction  double precision,
  computed_at      timestamptz not null default now()
);

-- Seed: what config/scans.ts already had. `on conflict do nothing` so a
-- re-run never clobbers a derived_url a pipeline has since written.
insert into scans (id, label, credit, source_url, units_to_metres, approx_points)
values (
  'autzen',
  'Autzen Stadium',
  'Aerial lidar, Eugene, Oregon · hobu, inc.',
  'https://hobu-lidar.s3.amazonaws.com/autzen-classified.copc.laz',
  0.3048,
  10653336
)
on conflict (id) do nothing;
