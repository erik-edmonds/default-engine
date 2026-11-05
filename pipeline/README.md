# The annotation pipeline

Takes a raw COPC survey, classifies it, computes height above ground, and
writes a derived COPC the headset viewer can colour by class or by height.

```
source COPC in S3
      |
      v   PDAL: outlier -> reset -> smrf -> hag_nn -> bands
derived COPC (local scratch, then S3)
      |
      v
Postgres: pipeline_runs + scan_stats + scans.derived_url
      |
      v
/scan/[id] renders it, coloured by class or height
```

## Why Python at all

The TypeScript side of this repo **cannot write LAZ**. `laz-perf@0.0.7` exposes
only `LASZip` and `ChunkDecoder`; copc.js exposes `create`,
`loadHierarchyPage`, `loadPointDataView` and `decompressChunk`. There is no
encoder, compressor or writer in either. Producing an annotated COPC therefore
has to happen somewhere else, and PDAL is the tool for it — `filters.smrf` and
`filters.hag_nn` are the cited, battle-tested implementations of exactly the
two hard steps.

## Running it

Build from the **repo root**, not from this directory — the image copies
`src/config/hagBands.json`, which is shared with the viewer:

```bash
docker build -f pipeline/Dockerfile -t scan-annotate .
```

Review the pipeline without a database, PDAL, or AWS:

```bash
python3 pipeline/annotate.py --scan autzen --dry-run
```

Run it for real with **no database and no S3** — both guards still fire, only
the provenance rows and the upload are skipped:

```bash
python3 pipeline/annotate.py \
  --source https://hobu-lidar.s3.amazonaws.com/autzen-classified.copc.laz \
  --units 0.3048 --keep ./out
```

This path exists because every other route needs `DATABASE_URL`, which made
"show me that it works" cost a schema migration on a production database. It is
deliberately not the default: a run with no row in `pipeline_runs` is a run
that left no trace.

### The image is not what you would guess

Three things, each found by running it rather than reading about it:

| Expectation | Reality |
|---|---|
| `pdal/pdal:2.10.2` exists | **It does not.** PDAL 2.10.2 is a real source release (2026-06-12), but Docker Hub's version tags stop at **2.9.2** (2025-09-01). `docker build` failed at the `FROM` line. |
| A version tag gives you that version | `pdal/pdal:2.9.2` runs **pdal 2.8.4**. |
| Multi-arch | Version tags are **amd64-only**; only `latest` carries arm64. |

So the Dockerfile pins the `latest` **index digest**, which is immutable,
resolves per-architecture, and currently gives pdal 2.10.2 — and
`require_pdal()` still asserts >= 2.7.0 at startup. That runtime assertion is
what caught the tag lying, and it is the reason a digest pin is safe.

On Apple Silicon the amd64 image runs `pdal --version` under QEMU and then
**segfaults on `pdal --drivers`**, so the pinned image cannot be exercised
locally on an M-series Mac. Local verification uses native arm64 `latest`; the
amd64 pin is verifiable only on an amd64 host, which is what EC2 is.

The image also carries **two conda envs**, and only the `pdal` one is useful:
`base` is a bare python 3.14.7, while `pdal` has python 3.14.8, numpy 2.5.3 and
the `pdal` 3.5.4 bindings. A bare `python3` silently gets `base`. Neither env
has **scipy** or **scikit-learn**, and `filters.python` / `readers.numpy` are
**not among the 181 stages** the image registers — they need a separate
plugin package.

On the EC2 box:

```bash
docker run --rm \
  -e DATABASE_URL="$DATABASE_URL" \
  -e SCAN_BUCKET="s3://your-bucket/scans" \
  -e AWS_REGION=us-east-1 \
  -v /mnt/scratch:/scratch \
  scan-annotate --scan autzen
```

No AWS keys. `readers.copc` goes through arbiter, which is always compiled into
PDAL and supports IMDSv2, so the instance profile covers both the ranged reads
and the upload. **The keys currently sitting in `.config` should be rotated and
the role used instead** — the file is gitignored, so nothing has leaked, but
long-lived keys on disk are not needed by anything here.

Run the migration first, or there is no registry to read:

```bash
node --experimental-strip-types --import ./scripts/alias-hook.mjs scripts/migrate.ts
```

## Instance sizing

**Buy RAM and clock, not vCPUs.** `filters.outlier`, `filters.smrf` and
`filters.hag_nn` are all single-threaded, and only the COPC writer's pyramid
build is threaded.

The whole pipeline runs in PDAL's **standard (non-streaming)** mode. None of
those three filters is streamable, and `writers.copc` alone would force it
anyway, because it must see every point to build the octree. So the entire
point table is resident: about 73 bytes per point, ≈ 0.78 GB for the 10.6M
point sample.

The swing factor is SMRF's rasters, and **`cell` must not be left at its
default on a file in feet**. SMRF allocates roughly eight rasters of
`extentX/cell × extentY/cell`:

| `cell` | square-mile field | rasters |
|---|---|---|
| 1.0 (feet) | 5280 × 5280 = 27.9M cells | ~1.7–3.5 GB |
| 3.28 (≈1 m) | 2.6M cells | ~0.2–0.35 GB |

`thresholds.py` always converts from metres, so this cannot happen by accident
— but it is why the conversion exists.

**`r6i.xlarge` / `r7i.xlarge` (4 vCPU / 32 GB)** is the right shape. 16 GB is
the floor. Scratch disk needs about 2× the output size.

## The three silent failures

Each produces a file that opens cleanly in the viewer and is completely wrong,
so `annotate.py` checks for them before anything is uploaded or recorded as
good.

**No ground points.** If `filters.smrf` classifies nothing as ground,
`filters.hag_nn` logs an error and *returns* — PDAL exits 0 and every
`HeightAboveGround` is 0. Every point then falls below the first band, nothing
is vegetation, and the output looks like a flat bare field.

**An implausible height range.** A wrong `units_to_metres`, or an SRS that did
not forward, gives heights off by 3.28× or kilometres tall. Both look like
numbers.

**A ground surface sitting above the data.** The third, and it was missing
until the pipeline was actually run: nothing looked *below* the ground at all.
A ground solve that latches onto a roof or a closed canopy puts the real
surface underneath itself, and every previous check would have passed that file
and uploaded it. It is judged on the fraction of points more than
`BELOW_GROUND_LIMIT_M` under the surface rather than on the single deepest one,
because a handful of deep strays is a normal artifact — the stadium sample's
worst point is 31 m down and only 19 points are past 10 m — while a systemic
collapse is not.

## Decisions worth not relitigating

**Height ships as `float32`, not a scaled integer.** The compact choice costs
two bytes per point and buys four hazards: PDAL's expression language has no
`min`/`max`, so clamping needs two extra `WHERE`-conditioned assigns; on a file
in feet `HeightAboveGround * 100` is centi-*feet*, not centimetres; and an
out-of-range value does not warn — `getFieldAs<int16_t>` throws, aborting the
write after every expensive stage has already run. `extra_dims: "all"` is worse
than either, writing it as `float64`.

One correction to the first of those: the "no `min`/`max`" limitation is true
of `filters.assign` expressions, which is where it was found, but **not** of
the height stages themselves — `filters.hag_dem` takes `min_clamp` and
`max_clamp` directly. That does not change the float32 decision, which rests
on the other three hazards, but the limitation is narrower than it was
written.

**The classification is reset before reclassifying.** `filters.smrf` only
writes `other_class` to points it considered, and points excluded by `returns`
— every first and intermediate return — keep their input class. The sample is
`autzen-classified.copc.laz`, already classified by someone else to an unknown
standard, so without the reset the output would be *partly* ours. For a
deliverable whose value is its provenance, that is the worst possible state.

**`ignore: Classification[7:7]` on SMRF is required, not defensive.** Without
it, SMRF overwrites the noise classification `filters.outlier` just produced.

**Noise is classified, not deleted.** A reviewer needs to see what the
classifier called noise in order to disagree with it.

**Statistics come from the run's own metadata, not from a second pass.** The
pipeline carries two `filters.stats` stages: one with `count` for the class
bins and `global` for the height median, and one with a `where` clause that
counts points below the ground surface. Three things to know about that:

- It replaced two `pdal info` subprocess calls that were **both wrong**. They
  passed `--stat`, which is not an option — it is `--stats` — so the guard
  raised `CalledProcessError` *after* the derivative had been written. Even
  corrected they would have been wrong twice more: `--stats` emits no
  per-value counts (that needs `filters.stats`' `count`, or `--enumerate`),
  and no median unless `global` is asked for, so the p50 recorded for every
  scan would have been the `0.0` default of a `.get("median", 0.0)`.
- PDAL keys pipeline metadata by stage **type** and ignores `tag`, so two
  stats stages arrive as a list under one key. `read_stats` identifies them by
  content, because position is what a later edit silently reorders.
- `hag_p95_m` is **still NULL, still deliberately**. `global` gives median,
  MAD and mode, not arbitrary percentiles. Height above ground is strongly
  zero-inflated — the stadium sample is 74% ground, so p1 through p50 are all
  exactly 0.0 — which is exactly why a mean-plus-1.64σ estimate would not be a
  95th percentile of anything.

## Measured, on the stadium sample

`autzen-classified.copc.laz`, 10.65M points, pdal 2.10.2, native arm64 in
Docker on an M-series laptop. **95 s wall clock**, 109.4 MB output.

| | |
|---|---|
| points in / out | 10,653,336 / 10,653,336 (noise is classified, never dropped) |
| ground (class 2) | 7,852,839 — **73.7%** |
| high vegetation (5) | 1,642,244 — 15.4% |
| medium vegetation (4) | 654,257 — 6.1% |
| noise (7) | 345,342 — 3.2% |
| low vegetation (3) | 83,252 — 0.8% |
| unclassified (1) | 75,402 — 0.7% |
| height above ground | min −31.11 m, median **0.0 m**, mean 2.93 m, max 58.24 m |
| below ground > 1 m | 649 points — 0.006%, within the 0.5% bound |

Cross-checked against an independent numpy pass over the written file: the
class counts agree exactly, and the percentiles it adds (p75 = 0.38 m,
p95 = 18.76 m, p99 = 31.88 m) confirm the zero-inflation — 74% of the cloud
has a height of exactly 0.0 because that is what `filters.hag_nn` writes for
ground.

`scripts/copc-golden.ts --url` against the derivative then passes **all 14
checks**, and the four it previously reported as SKIP now actually run:
`HeightAboveGround` lands at **byte 36 of a 40-byte record as float32** —
immediately after PDRF 7's 36-byte base — it reads with **scale 1, not PDAL's
stored 0.0**, and it agrees with copc.js's own reader to **0.00e+0**. That is
the only check on an offset that is computed rather than constant, and until
there was a derived file to point it at, it could not run at all.

### What it does not tell you

**73.7% ground is high.** For a stadium bowl with mature firs it is defensible,
but SMRF with these parameters calling three-quarters of a cloud "ground" is
exactly the number to distrust on a cornfield, where a closed canopy should be
hiding the soil rather than dominating it.

**The −31 m minimum is a real artifact, not a rounding error**, though only 19
points are deeper than 10 m. It is what a ground surface solved on top of a
roof or a canopy does to the points underneath it. The guard now counts them
and trips on the fraction; it had previously looked only at the maximum and so
would have passed a wholly collapsed ground surface.

**The vertical and horizontal units are not the same foot.** The file's SRS is
a compound CRS: `NAD83 / Oregon GIC Lambert (ft)` horizontally, using the
international foot (0.3048, EPSG 9002), over `NAVD88 height (ftUS)` vertically,
using the **US survey foot** (0.304800609601219, EPSG 9003). `units_to_metres`
is a single scalar applied to both. The discrepancy is 2 ppm — 0.12 mm on a
58 m height — so it is correctly ignored here, but it is written down so nobody
later "fixes" it into a 1.3 m error by confusing the two at state-plane
magnitudes, where coordinates are ~637,000 ft.

## What this cannot tell you yet

**The band thresholds are not merely unvalidated for corn — they are wrong for
it, and the measurement exists.** KC & Khanal (*Precision Agriculture* 27:170,
2026) field-measured maize at 12–53 cm at V4–V5 (mean 38.27, sd 11.71) and
140–255 cm at VT (mean 218.43, sd 37.25). Against the bands in
`src/config/hagBands.json` — 0.1–0.5 / 0.5–5.0 / 5.0+ m — a whole young field
lands in "low vegetation" and a whole mature field in "medium vegetation". The
ladder carries no information on a cornfield at any single date, so height has
to go back to being a measurement and a feature rather than the definition of
the class.

The only scan wired up is still an aerial survey of a football stadium. It
exercises every stage, the extra-bytes offsets and the viewer end to end — and
it has now done so — but it is not a test of the agronomy.
