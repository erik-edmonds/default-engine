# Project status — 14 November 2026

Where the project stands: what is finished and verified, what works but needs
improvement, and what has not been started. Everything here was checked on the
date above unless it says otherwise, and each claim names the evidence behind
it.

## Snapshot

| | |
|---|---|
| Git | `main` at `6f1e6de`, in sync with origin. Two files uncommitted: `pipeline/thresholds.py` and `pipeline/test_thresholds.py` (+200/−44), the nodata-leak fix and its tests |
| Size | 390 tracked files, 276 MB tracked; `public/` is 545 MB on disk |
| Gates | `tsc` clean · eslint 64 errors / 33 warnings (the tolerated baseline) · `yarn test:arith` passes (126 checks) · `yarn test:pipeline` passes (52 tests) |
| Not re-run on this date | `yarn test:copc` (needs network; last run passed) · the colour probe (needs a build, a server and a browser; last run 20/20) |
| Neon | Connects with verified TLS. None of the four tables exist: the migration has never been run, so the site serves the static fallback table |
| Workstation | Apple M4, 16 GB RAM, about 8 GB disk free, Blender 5.1.2, conda, Docker with the PDAL 2.10.2 arm64 image. No NVIDIA GPU, no PyTorch |

## 1. Done and verified

Each item has evidence that still exists and still passes. These need no
further work.

1. **COPC decoding, including computed extra-byte offsets**
   (`src/lib/copc/records.ts`, `extraBytes.ts`, `source.ts`). The golden test
   compared the hand-written parser against copc.js on a real derived file and
   passed all 14 checks: `HeightAboveGround` at byte 36 of a 40-byte record,
   float32, read with scale 1 rather than PDAL's stored 0.0, with zero error.
2. **Unit conversion and pipeline construction** (`pipeline/thresholds.py`).
   52 unit tests in feet and metres, including regression tests for two real
   unit bugs caught while writing them.
3. **The SMRF pipeline, end to end.** It ran on the 10.65M-point stadium sample
   in 95 s. Class counts were cross-checked exactly against an independent
   numpy pass, all three guards were exercised, and it runs with no database
   and no S3 through `--source` and `--units`.
4. **Run statistics taken from PDAL's own metadata.** These replaced two
   `pdal info` calls that were both wrong: a flag that does not exist, counts
   that were never emitted, and a median that silently defaulted to 0.0.
5. **The Docker base pin and the runtime version check.** `pdal/pdal:2.10.2`
   never existed and `pdal/pdal:2.9.2` contains PDAL 2.8.4. The pin is now an
   index digest that resolves to 2.10.2, and the code asserts the version it
   finds at startup.
6. **The database connection** (`src/lib/db.ts`). Certificate verification was
   silently off; it is now `verify-full`, tested live against Neon. The pool is
   cached in production and has timeouts, and migrations use the unpooled URL.
7. **The registry fallback** (`src/lib/scans.ts`). It falls back when there is
   no database and when the table is missing, and on nothing else. That is the
   state Neon is in, and the site builds and serves correctly through it.
8. **XR arithmetic.** 126 checks cover frame timing, wrist layout, the wrist
   gate, scale rigs and two-hand manipulation.
9. **The point shader and colour modes** (`src/lib/scan/pointMaterial.ts`).
   One shader program across all nodes, per-node point size of 4.4–14 px, and
   the sRGB double-encode fixed. The committed probe passed 20/20.
10. **The structure of the written-work section.** `/portfolio` and four
    write-ups render from one table (`src/config/projects.ts`) inside a shared
    layout.
11. **The SLG ground method, run and compared.** Measured against SMRF on the
    same file and the same code: ground 63.18% against 73.71%, and the
    below-ground tail gone entirely — **0 points** more than a metre under the
    surface against SMRF's **649**, minimum 0.000 m against **−31.110 m** —
    at the same cost (91 s against 90 s). The derivative passes all 14 golden
    checks. See `pipeline/README.md`.
12. **Crop-row detection** (`pipeline/rows.py`). Heading exact to 0.00° and
    spacing to the 0.5 cm scan step on every synthetic case, including 60%
    weed contamination and a 40% sparse stand; rows located to within 1 mm.
    Refuses structureless vegetation with four orders of magnitude of margin.
    17 tests.
13. **Synthetic field generation and simulated flight** (`sim/`). CropCraft
    fields, terrain, HELIOS++ surveys and per-point ground truth, 14 s a
    field. 19 tests.

## 2. Done, but needs improvement

Ordered within each area by how much the item matters.

### Pipeline

| Item | What is wrong | Evidence |
|---|---|---|
| Fetching over a network | `readers.copc` over HTTPS hung for six hours on the SLG path and had to be killed. The same file from local disk: 41 s. There is no retry, and one transient failure killed a run on 10 November | Run logs, 10 and 14 November |
| Height bands | Wrong for corn: a whole field lands in one class | Asserted as passing tests of a known defect in `pipeline/test_thresholds.py` |
| `hag_p95_m` | Always NULL | Deliberate until a pass over the values exists |
| Docker image | Never built. There is no `requirements.txt`, scipy and scikit-learn are absent, and the amd64 image cannot be exercised on this machine because it segfaults under emulation | `docker build` has never been run |
| Registry path | `--scan`, the provenance rows and the S3 upload have never executed | The tables do not exist |
| Fetch resilience | One transient S3 read failure killed a run, and `annotate.py` has no retry | Run log, 10 November |
| README | Does not yet describe the SLG method or the nodata finding | `pipeline/README.md` |

### Viewer

| Item | What is wrong |
|---|---|
| Layers | The viewer can read exactly one extra dimension (`HeightAboveGround`), and the class palette is generic ASPRS |
| Desktop control | There is no way to switch colour mode on desktop. `setColorMode` is reachable only from the VR menu, or with the development flag `?menu=1` |
| Point budget | `XR_POINT_BUDGET = 750_000` is arithmetic; `src/config/xrScan.ts` says so itself. It has never been measured on a headset, and the per-point attribute cost has risen 21% since it was set |
| Derived files | A local derivative cannot be opened without editing config |

### XR

| Item | What is wrong |
|---|---|
| Controller bindings | Every stick, grip and button depends on a runtime fetch from jsDelivr, because `baseAssetPath` is not set |
| Regression coverage | The 13 browser probes that verified the VR menu, wrist gate, navigation and audio were lost with a temporary directory. One probe survives (`scripts/scan-colour-probe.mjs`) |

### Site and infrastructure

| Item | What is wrong |
|---|---|
| CI | None. There is no `.github` directory and there are no hooks, so every suite runs only when someone types the command |
| Lint | 64 errors are tolerated as a baseline, and `scripts/` is excluded from type-checking |
| Repo weight | `public/models/pipboy.glb` (62 MB, the original) is tracked although the code loads `pipboy.compressed.glb`. `music.mp3` is 50 MB and `Avatars/base.glb` is 39 MB |
| Lockfiles | Both `yarn.lock` and `package-lock.json` exist, with `packageManager` set to yarn |
| Secrets | `.config` holds AWS keys. It is ignored and untracked, so nothing has leaked, but the keys should be rotated. There is no `.env.example` |
| Write-ups | `stack` and `links` are empty on all four projects, and the index says "Four things I've built" |
| Error boundaries | `SceneBoundary` wraps only the 404 scene; the scan viewer and the island are not wrapped |

## 3. Not done

### Blocked on things outside the code

- Real corn data, which was weeks away as of 6 November, and so any accuracy
  figure on real data.
- Running the Neon migration. It is the owner's database and has not been
  requested.
- EC2: the image build, the instance profile, the bucket and key rotation.
  There is no infrastructure-as-code.
- A measured point budget on a headset.

### Not started

- The corn pipeline: features, row detection, the soil/crop/weed/noise
  segmenter, plant instances and class layers. The synthetic-cornfield
  demonstration builds these.
- Any deep model. Point Transformer V3 and its successors need an NVIDIA GPU;
  this is deferred by decision.
- The in-headset labeller, label storage and the write-back loop.
- CI.
- The business pivot of the site itself. The home page and portfolio still
  present a personal portfolio. There is no page describing the annotation
  service, no sample deliverable and no intake.
- Mid- and late-season corn. CropCraft's maize models stop at 0.49 m.

### Decisions that are the owner's

- Whether and when to run the migration.
- Whether the 62 MB `pipboy.glb` original leaves the repo.
- Where a fifth project sits in the portfolio order.
- The loading-screen web. No `?grid` flag remains in the code, so this looks
  settled, but it is worth a confirming look.

## What comes next

The synthetic-cornfield demonstration: maize fields generated with CropCraft,
scanned with a simulated UAS LiDAR at the flight parameters of KC & Khanal
(2026), run through the annotation pipeline, and scored against the
simulator's ground truth. It is presented as a fifth work write-up and as a
live 3D scan with switchable layers. It runs on the workstation alone and is
labelled as the classical baseline; the deep-learning round follows when a GPU
is available.
