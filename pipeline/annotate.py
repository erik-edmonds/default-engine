#!/usr/bin/env python3
"""Annotate one COPC scan: ground, vegetation classes, height above ground.

    python annotate.py --scan autzen
    python annotate.py --scan autzen --dry-run        # print the pipeline only
    python annotate.py --scan autzen --no-upload      # keep the output local

    # Registry-free: no DATABASE_URL, no S3, both guards still run. This is
    # the path for "show me what it does" without migrating a database first.
    python annotate.py --source <url-or-path> --units 0.3048 --keep ./out

Reads the scan from the Postgres registry, builds the PDAL pipeline with
thresholds converted into the file's own units, runs it, checks the two things
that can fail silently, uploads the derivative to S3 and records what happened.

THE TWO SILENT FAILURES THIS EXISTS TO CATCH. Both produce a file that opens
cleanly in the viewer and is entirely wrong, which is the worst outcome
available to an annotation service:

  1. NO GROUND POINTS. If filters.smrf classifies nothing as ground,
     filters.hag_nn logs an error and RETURNS -- the pipeline reports success
     and every HeightAboveGround is 0. Every point then falls below the first
     band, so nothing is vegetation, and the result looks like a survey of a
     perfectly flat bare field.

  2. AN IMPLAUSIBLE HEIGHT RANGE. A units_to_metres that is wrong, or an SRS
     that did not forward, gives heights that are off by 3.28x or are
     kilometres tall. Both look like numbers.

Neither is a PDAL bug; both are consequences of PDAL doing exactly what it was
asked. So they are checked here, against the run's own metadata, before
anything is uploaded or recorded as good.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import thresholds

# What counts as a believable canopy, in metres. Generous on purpose: the
# sample scan is a stadium with mature trees, and a shelterbelt is taller than
# any crop. This is a sanity bound, not an agronomic one.
MAX_PLAUSIBLE_HAG_M = 120.0

# How much of the ground raster has to carry a real value. A percentile grid
# over a dense aerial survey should be very nearly complete; a materially
# emptier one means the cells are smaller than the point spacing supports.
MIN_DTM_VALID_PERCENT = 95.0

# How many points may end up with no usable height -- class 0, "never
# classified" -- before the ground surface counts as too holed to trust.
# Small, because a point over a hole in the DTM is a point this pipeline has
# no answer for, and an annotation service selling coverage cannot have many.
MAX_NEVER_CLASSIFIED_FRACTION = 0.01

# Named once because the registry path has to PREDICT the DTM's location, to
# record the pipeline it is about to run before running it, while
# prepare_ground is what actually produces the file. Two literals would be two
# places for that to drift.
DTM_NAME = "dtm.tif"
CSM_NAME = "csm.tif"


def pdal_version() -> tuple[str, tuple[int, ...]]:
    out = subprocess.run(["pdal", "--version"], capture_output=True, text=True, check=True).stdout
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", out)
    if not match:
        raise RuntimeError(f"could not read a version out of: {out.strip()!r}")
    return match.group(0), tuple(int(g) for g in match.groups())


def require_pdal(method: str = "smrf") -> str:
    """Assert the runtime version, which is the only thing worth trusting.

    THE IMAGE TAG LIES. `pdal/pdal:2.9.2` contains pdal 2.8.4, and
    `pdal/pdal:2.10.2` does not exist at all -- Docker Hub's version tags stop
    at 2.9.2 while the source releases are a year ahead. The Dockerfile
    therefore pins an index digest, and this check is what makes that safe: a
    digest says nothing about the version it resolves to.

    The floor depends on the method, because the two need different features.
    """
    text, parts = pdal_version()
    need = thresholds.required_pdal(method)
    if parts < need:
        want = ".".join(str(n) for n in need)
        why = (
            "writers.gdal gained percentile `output_type` in PR #4839, merged "
            "2025-11-19, after the 2.9.2 release"
            if method == "slg"
            else "writers.copc gained `extra_dims` in 2.7.0"
        )
        raise SystemExit(
            f"PDAL {text} is too old for method {method!r}: needs {want}.\n"
            f"{why}.\n"
            "The pinned digest in pipeline/Dockerfile resolves to 2.10.2; a semantic\n"
            "tag like pdal/pdal:2.9.2 will NOT ("
            "it contains 2.8.4)."
        )
    return text


# --- the registry -------------------------------------------------------
#
# psycopg is imported lazily so --dry-run works with no database and no
# driver installed, which is what makes the pipeline reviewable on a laptop.


def connect():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set.")
    try:
        import psycopg
    except ImportError as exc:
        raise SystemExit("psycopg is not installed. See pipeline/Dockerfile.") from exc
    return psycopg.connect(url)


def load_scan(conn, scan_id: str) -> dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            "select id, source_url, units_to_metres from scans where id = %s",
            (scan_id,),
        )
        row = cur.fetchone()
    if not row:
        raise SystemExit(f"no scan {scan_id!r} in the registry. Run scripts/migrate.ts first.")
    return {"id": row[0], "source_url": row[1], "units_to_metres": float(row[2])}


# --- running ------------------------------------------------------------


def run_pipeline(pipeline: list[dict[str, Any]], out_dir: Path, name: str = "pipeline") -> dict[str, Any]:
    """Run PDAL and return its metadata.

    Via the `pdal pipeline` CLI rather than the Python bindings, for one
    reason: `--metadata` writes a file that is the complete record of what each
    stage actually did, which is what the checks below and the provenance row
    both need. The bindings expose the same thing less directly.

    `name` keeps the two passes of the SLG method from overwriting each other's
    spec and metadata, which would leave the run with no record of how the
    surfaces were built.
    """
    spec = out_dir / f"{name}.json"
    meta = out_dir / f"{name}.metadata.json"
    spec.write_text(json.dumps({"pipeline": pipeline}, indent=2))

    proc = subprocess.run(
        ["pdal", "pipeline", str(spec), "--metadata", str(meta)],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"pdal failed ({proc.returncode}):\n{proc.stderr.strip()}")
    return json.loads(meta.read_text())


# --- the SLG method's first pass ----------------------------------------


def raster_info(path: Path) -> dict[str, Any]:
    """A raster's bounds and SRS, via gdalinfo.

    GDAL is a hard dependency of PDAL, so `gdalinfo` is always present
    alongside it; no new tool enters the image for this.
    """
    out = subprocess.run(
        ["gdalinfo", "-json", "-stats", str(path)], capture_output=True, text=True, check=True
    ).stdout
    info = json.loads(out)
    corners = info.get("cornerCoordinates", {})
    lower, upper = corners.get("lowerLeft"), corners.get("upperRight")
    if not lower or not upper:
        raise RuntimeError(f"gdalinfo reported no corner coordinates for {path}")

    # `-stats` makes GDAL report STATISTICS_VALID_PERCENT per band, which is
    # the fraction of cells that actually got a value. For a percentile raster
    # that is exactly the measure wanted: a cell with no points in it is a hole
    # in the ground surface, and every point above a hole gets no height.
    bands = info.get("bands", [])
    valid_percent = None
    if bands:
        meta = bands[0].get("metadata", {}).get("", {})
        raw = meta.get("STATISTICS_VALID_PERCENT")
        if raw is not None:
            valid_percent = float(raw)

    return {
        "minx": min(lower[0], upper[0]),
        "maxx": max(lower[0], upper[0]),
        "miny": min(lower[1], upper[1]),
        "maxy": max(lower[1], upper[1]),
        "wkt": (info.get("coordinateSystem") or {}).get("wkt", ""),
        "size": info.get("size", []),
        "bands": len(bands),
        "valid_percent": valid_percent,
    }


def reader_bounds(metadata: dict[str, Any]) -> dict[str, float]:
    reader = metadata.get("stages", {}).get("readers.copc", {})
    try:
        return {k: float(reader[k]) for k in ("minx", "maxx", "miny", "maxy")}
    except (KeyError, TypeError) as exc:
        raise RuntimeError("the run metadata has no readers.copc bounds") from exc


def check_dtm_covers(dtm: Path, cloud: dict[str, float]) -> dict[str, Any]:
    """Refuse a DTM that does not cover the cloud.

    THE GUARD FOR A FAILURE PDAL WILL NOT REPORT. filters.hag_dem passes each
    point's X/Y straight to the raster and, for a point outside the extent,
    takes the "skip any other errors" path -- no height, no warning, exit 0.
    A DTM that covers 90% of a field therefore produces a file where a tenth of
    the points silently have no height, which looks exactly like a tenth of the
    field being bare ground.

    Checked before pass two runs, so the failure costs seconds rather than the
    whole classification.
    """
    raster = raster_info(dtm)
    missing = {
        "west": round(cloud["minx"] - raster["minx"], 3),
        "east": round(raster["maxx"] - cloud["maxx"], 3),
        "south": round(cloud["miny"] - raster["miny"], 3),
        "north": round(raster["maxy"] - cloud["maxy"], 3),
    }
    # Each value is how far the raster extends BEYOND the cloud on that side;
    # negative means the cloud sticks out and those points would get no height.
    short = {side: gap for side, gap in missing.items() if gap < 0}
    if short:
        raise RuntimeError(
            f"the DTM does not cover the point cloud: short by {short} (file units).\n"
            "filters.hag_dem gives out-of-extent points NO height, silently, so this\n"
            "would produce a derivative with a partly-null height field."
        )

    # THE FILL PERCENTAGE IS REPORTED, NOT ENFORCED, and the first version of
    # this guard enforced it and was wrong.
    #
    # It failed the stadium sample at 91.4% against a 95% bound, and 91.4% was
    # correct: a survey footprint is a flight path, which is a rotated
    # parallelogram, while a GeoTIFF is axis-aligned. The corners of the
    # bounding box are legitimately outside the data. Worse, the measure does
    # not describe the hazard -- an empty cell contains no points, so it gives
    # no point a wrong height.
    #
    # What actually matters is how many POINTS landed over a hole, and that is
    # now counted downstream: filters.hag_dem writes thresholds.NODATA_HAG
    # there, nodata_stage turns those into class 0, and the class histogram the
    # run already produces counts them. The number is checked in check_output.
    valid = raster.get("valid_percent")
    if valid is not None and valid < MIN_DTM_VALID_PERCENT:
        print(
            f"  note: the DTM is {valid:.1f}% filled. Expected below 100% for a "
            "non-rectangular footprint; what matters is the class-0 count below.",
            file=sys.stderr,
        )
    return raster


def check_dtm_crs(raster: dict[str, Any], metadata: dict[str, Any]) -> None:
    """For a REUSED DTM only: assert it shares the cloud's coordinate system.

    PDAL does none of this. filters/HagDemFilter.cpp computes `hag = z - val`
    with no reprojection and no unit handling, so a DTM in a different CRS --
    or the same CRS with a different vertical unit, which this sample's
    compound international-foot-over-US-survey-foot SRS shows is a real shape
    -- produces heights that are wrong by a scale factor and look fine.

    Compared loosely, on the projection and vertical-unit names rather than the
    full WKT, because an identical CRS can be spelled several ways and a strict
    string compare would reject correct inputs.
    """
    cloud_wkt = metadata.get("stages", {}).get("readers.copc", {}).get("comp_spatialreference", "")
    raster_wkt = raster.get("wkt", "")
    if not raster_wkt or not cloud_wkt:
        print("  WARNING: could not compare the DTM's CRS with the cloud's", file=sys.stderr)
        return

    def units(wkt: str) -> set[str]:
        return {u.lower() for u in re.findall(r'UNIT\["([^"]+)"', wkt)}

    shared = units(cloud_wkt) & units(raster_wkt)
    if not shared:
        raise RuntimeError(
            f"the reused DTM's units {sorted(units(raster_wkt))} do not match the cloud's "
            f"{sorted(units(cloud_wkt))}.\n"
            "filters.hag_dem does not convert units: every height would be wrong by a\n"
            "scale factor and nothing would warn."
        )


def run_surfaces(
    source: str, work: Path, units_to_metres: float, resolution_m: float | None = None
) -> tuple[Path, Path, dict[str, Any]]:
    """Pass one: the ground and canopy percentile rasters."""
    dtm, csm = work / DTM_NAME, work / CSM_NAME
    pipeline = thresholds.build_surface_pipeline(
        source, str(dtm), str(csm), units_to_metres, resolution_m
    )
    metadata = run_pipeline(pipeline, work, name="surfaces")
    if not dtm.exists() or not csm.exists():
        raise RuntimeError("the surface pass reported success but wrote no raster")
    return dtm, csm, metadata


def source_summary(source: str) -> dict[str, float]:
    """The source's bounds, read from its header rather than its points.

    `pdal info --summary` does not decompress anything, so this costs two range
    requests against an S3 COPC. Needed only when a DTM is REUSED, where there
    is no surface pass to take bounds from.
    """
    out = subprocess.run(
        ["pdal", "info", source, "--summary"], capture_output=True, text=True, check=True
    ).stdout
    bounds = json.loads(out).get("summary", {}).get("bounds", {})
    try:
        return {k: float(bounds[k]) for k in ("minx", "maxx", "miny", "maxy")}
    except (KeyError, TypeError) as exc:
        raise RuntimeError(f"could not read bounds from `pdal info --summary` for {source}") from exc


def source_srs(source: str) -> dict[str, Any]:
    """The source's SRS, shaped like pipeline metadata so check_dtm_crs reads
    it the same way whether it came from a run or from a header."""
    out = subprocess.run(
        ["pdal", "info", source, "--metadata"], capture_output=True, text=True, check=True
    ).stdout
    meta = json.loads(out).get("metadata", {})
    wkt = meta.get("comp_spatialreference") or meta.get("spatialreference") or ""
    return {"stages": {"readers.copc": {"comp_spatialreference": wkt}}}


def prepare_ground(
    source: str,
    units_to_metres: float,
    work: Path,
    method: str,
    dtm_path: str | None = None,
    resolution_m: float | None = None,
) -> tuple[str | None, dict[str, Any]]:
    """Pass one and the checks between the passes.

    Returns the DTM to hand filters.hag_dem (None for SMRF) and a record of
    where the ground surface came from. That record is provenance, not
    decoration: "which surface produced these heights" is the question a QA
    dispute actually turns on.

    SEPARATE FROM THE CLASSIFICATION PASS so the caller can write its
    `pipeline_runs` row before anything expensive starts. A run that crashed
    without leaving a trace is the one thing provenance must not permit.
    """
    if method != "slg":
        return None, {"method": method}

    surfaces: dict[str, Any] = {"method": method}
    if dtm_path:
        # A REUSED SURFACE -- the paper's strongest strategy, and the one PDAL
        # will not sanity-check for you. Subtracting a sparse-canopy DTM from
        # an early flight out of a dense-canopy cloud took its nRMSE from 61%
        # to 17%, matching LiDAR.
        dtm = Path(dtm_path)
        if not dtm.exists():
            raise RuntimeError(f"the DTM {dtm} does not exist")
        raster = check_dtm_covers(dtm, source_summary(source))
        check_dtm_crs(raster, source_srs(source))
        surfaces["reused"] = True
    else:
        dtm, csm, surface_meta = run_surfaces(source, work, units_to_metres, resolution_m)
        raster = check_dtm_covers(dtm, reader_bounds(surface_meta))
        surfaces["csm"] = str(csm)
        surfaces["resolution_file_units"] = thresholds.surface_stage(
            "", thresholds.GROUND_PERCENTILE, units_to_metres, resolution_m
        )["resolution"]
        surfaces["reused"] = False

    surfaces["dtm"] = str(dtm)
    surfaces["dtm_valid_percent"] = raster.get("valid_percent")
    surfaces["dtm_size"] = raster.get("size")
    filled = raster.get("valid_percent")
    print(
        f"  ground surface: {raster.get('size')} cells"
        + (f", {filled:.1f}% filled" if filled is not None else "")
    )
    return str(dtm), surfaces


def read_stats(metadata: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Pull the two filters.stats results out of the run's own metadata.

    IDENTIFIED BY CONTENT, NOT BY POSITION. PDAL keys pipeline metadata by
    stage TYPE and ignores `tag`, so two filters.stats stages arrive as a list
    under one `filters.stats` key in pipeline order. Indexing that list would
    work today and break silently the first time a stage is reordered, so the
    overall entry is found by looking for the one that actually carries
    Classification bins.
    """
    entry = metadata.get("stages", {}).get("filters.stats")
    if entry is None:
        raise RuntimeError(
            "no filters.stats in the run metadata -- thresholds.build_pipeline "
            "is expected to include stats_stage() and below_ground_stage()"
        )
    groups = entry if isinstance(entry, list) else [entry]

    overall: dict[str, Any] = {}
    below: dict[str, Any] = {}
    for group in groups:
        stats = {s["name"]: s for s in group.get("statistic", [])}
        if "Classification" in stats:
            overall = stats
        elif "HeightAboveGround" in stats:
            below = stats["HeightAboveGround"]

    if not overall:
        raise RuntimeError("the run metadata has no Classification statistics")
    return overall, below


def check_output(metadata: dict[str, Any], units_to_metres: float) -> dict[str, Any]:
    """The guards. Raises rather than returning a verdict, because an
    unchecked derivative must never reach S3.

    Everything here comes from the pipeline's own metadata, so the finished
    file is never re-opened or re-scanned.
    """
    overall, below = read_stats(metadata)

    cls = overall["Classification"]
    total = int(cls["count"])
    # `count: "Classification"` yields a `bins` dict keyed by the value
    # formatted as a float ("2.000000"), so the keys need normalising before
    # anything looks up class 2.
    classes = {str(int(float(k))): int(v) for k, v in cls.get("bins", {}).items()}
    ground = classes.get("2", 0)

    if total == 0:
        raise RuntimeError("the written file has no points")
    if ground == 0:
        raise RuntimeError(
            "filters.smrf classified NO points as ground.\n"
            "filters.hag_nn logs an error and returns in that case, so every\n"
            "HeightAboveGround is 0 and the pipeline still reported success.\n"
            "Tune smrf's cell/slope/threshold -- do not trust this output."
        )

    if "HeightAboveGround" not in overall:
        raise RuntimeError(
            "HeightAboveGround is not in the written file -- extra_dims did not take effect"
        )
    hag = overall["HeightAboveGround"]
    max_m = float(hag["maximum"]) * units_to_metres
    min_m = float(hag["minimum"]) * units_to_metres

    if max_m > MAX_PLAUSIBLE_HAG_M:
        raise RuntimeError(
            f"the tallest point is {max_m:.1f} m above ground, over the "
            f"{MAX_PLAUSIBLE_HAG_M:.0f} m sanity bound.\n"
            "Usually a wrong units_to_metres, or an SRS that did not forward."
        )
    if max_m <= 0:
        raise RuntimeError(
            f"no point is above the ground surface (max {max_m:.3f} m).\n"
            "Either the ground solve swallowed the canopy or HAG was never computed."
        )

    # THE GUARD THAT WAS MISSING. Nothing previously looked below the ground at
    # all, so a collapsed or inverted ground surface -- which puts most of the
    # cloud underneath itself -- would have passed every check and been
    # uploaded. Judged on the fraction rather than the extreme value, because a
    # handful of deep strays is a normal artifact and a systemic failure is not.
    below_count = int(below.get("count", 0)) if below else 0
    below_fraction = below_count / total
    if below_fraction > thresholds.BELOW_GROUND_MAX_FRACTION:
        raise RuntimeError(
            f"{below_count:,} points ({below_fraction * 100:.2f}%) sit more than "
            f"{thresholds.BELOW_GROUND_LIMIT_M:.1f} m BELOW the ground surface, over the "
            f"{thresholds.BELOW_GROUND_MAX_FRACTION * 100:.1f}% bound.\n"
            "The ground solve is above the data somewhere -- commonly smrf latching\n"
            "onto a roof or canopy and calling it ground."
        )

    # THE HOLED-SURFACE GUARD, and it is counted in points rather than in
    # raster cells for the reason check_dtm_covers explains: an empty cell
    # mis-heights nothing, while a point over an empty cell has no height at
    # all. filters.hag_dem writes NODATA_HAG there and nodata_stage turns those
    # into class 0, so the histogram this run already produced is the count --
    # no extra pass and no extra stats stage.
    never = classes.get(str(thresholds.NEVER_CLASSIFIED), 0)
    never_fraction = never / total
    if never_fraction > MAX_NEVER_CLASSIFIED_FRACTION:
        raise RuntimeError(
            f"{never:,} points ({never_fraction * 100:.2f}%) have no height at all, over the "
            f"{MAX_NEVER_CLASSIFIED_FRACTION * 100:.1f}% bound.\n"
            "The ground raster has holes under them. Either the cloud is too sparse for\n"
            "this resolution, or --resolution is too fine for the point spacing."
        )

    return {
        "point_count": total,
        "class_histogram": classes,
        "ground_fraction": ground / total,
        "never_classified": never,
        "never_classified_fraction": never_fraction,
        "hag_max_m": max_m,
        "hag_min_m": min_m,
        # Real now, from filters.stats `global`. It used to be a
        # `.get("median", 0.0)` against output that never contained a median,
        # so every scan recorded 0.0 whatever its distribution was.
        "hag_p50_m": float(hag["median"]) * units_to_metres,
        # STILL NULL, AND STILL DELIBERATELY. filters.stats `global` gives
        # median, MAD and mode -- not arbitrary percentiles. Height above
        # ground is strongly zero-inflated (the stadium sample is 74% ground,
        # so p1 through p50 are all exactly 0), which is precisely why a
        # mean-plus-sigma estimate of p95 would not be a 95th percentile of
        # anything. A real p95 needs a pass over the values; see pipeline/README.md.
        "hag_p95_m": None,
        "below_ground_count": below_count,
        "below_ground_fraction": below_fraction,
    }


def upload(path: Path, destination: str) -> str:
    parsed = urlparse(destination)
    if parsed.scheme != "s3":
        raise SystemExit(f"expected an s3:// destination, got {destination!r}")
    subprocess.run(["aws", "s3", "cp", str(path), destination], check=True)
    # The https form is what the browser fetches, and it has to be a stable
    # URL: `Range` is not a CORS-safelisted header, so every ranged request is
    # preflighted and Chromium caches that preflight keyed on the URL. A URL
    # that changes per request would mean a preflight per node.
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")
    region = os.environ.get("AWS_REGION", "us-east-1")
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scan", help="scan id in the registry")
    ap.add_argument("--source", help="COPC url or local path, bypassing the registry (needs --units)")
    ap.add_argument("--units", type=float, help="metres per file unit, for use with --source")
    ap.add_argument("--dest", help="s3://bucket/key for the derivative (default: $SCAN_BUCKET)")
    ap.add_argument("--dry-run", action="store_true", help="print the pipeline and exit")
    ap.add_argument("--no-upload", action="store_true", help="run and check, but keep the file local")
    ap.add_argument("--keep", help="directory to leave the output in")
    ap.add_argument(
        "--method",
        choices=("smrf", "slg"),
        default="smrf",
        help="ground method: 'smrf' is the morphological solve, 'slg' the paper's percentile grid",
    )
    ap.add_argument(
        "--dtm",
        help="reuse an existing ground raster instead of building one (implies --method slg)",
    )
    ap.add_argument(
        "--resolution",
        type=float,
        help=f"SLG cell size in METRES (default {thresholds.dtm_resolution_m():.2f}, "
        f"= {thresholds.ROW_SPACING_M} m row spacing x {thresholds.GRID_FACTOR})",
    )
    args = ap.parse_args()

    if not args.scan and not args.source:
        ap.error("pass --scan to read the registry, or --source with --units to bypass it")
    if args.source and args.units is None:
        ap.error("--source needs --units: metres per file unit, 0.3048 for a survey in US feet")

    # Reusing a DTM only means anything in the SLG method -- it is the raster
    # filters.hag_dem reads -- so --dtm selects it rather than conflicting
    # with a stale default.
    method = "slg" if args.dtm else args.method
    if args.resolution is not None and method != "slg":
        ap.error("--resolution only applies to --method slg")

    name = args.scan or Path(urlparse(args.source).path).name.split(".")[0] or "scan"

    # --dry-run needs neither PDAL nor a database, so the pipeline can be
    # reviewed anywhere. The scan's units are the only input.
    if args.dry_run:
        units = args.units if args.units is not None else float(os.environ.get("UNITS_TO_METRES", "0.3048"))
        source = args.source or f"s3://example/{name}.copc.laz"
        out = {}
        if method == "slg":
            out["surfaces"] = thresholds.build_surface_pipeline(
                source, "/scratch/dtm.tif", "/scratch/csm.tif", units, args.resolution
            )
        out["pipeline"] = thresholds.build_pipeline(
            source,
            f"/scratch/{name}.annotated.copc.laz",
            units,
            method=method,
            dtm_path=args.dtm or "/scratch/dtm.tif",
        )
        print(json.dumps(out, indent=2))
        return 0

    version = require_pdal(method)

    work = Path(args.keep) if args.keep else Path(tempfile.mkdtemp(prefix=f"{name}-"))
    work.mkdir(parents=True, exist_ok=True)
    output = work / f"{name}.annotated.copc.laz"

    # --- registry-free ------------------------------------------------------
    #
    # WHY THIS PATH EXISTS. Every other route through this script requires
    # DATABASE_URL, so demonstrating that the pipeline works at all would
    # otherwise mean migrating a production database first -- a schema change
    # as the price of a smoke test. Here the pipeline runs end to end and BOTH
    # guards in check_output still fire; only the provenance rows and the
    # upload are skipped.
    #
    # It is deliberately NOT the default. A run with no row in pipeline_runs
    # is a run that left no trace, and for a service whose product is
    # provenance that is the wrong default -- even though it is the right tool
    # for answering "show me what it does".
    if args.source:
        print(f"  pdal {version}, {args.units} m per file unit, method {method}, registry bypassed")
        dtm_arg, surfaces = prepare_ground(
            args.source, args.units, work, method, args.dtm, args.resolution
        )
        pipeline = thresholds.build_pipeline(
            args.source, str(output), args.units, method=method, dtm_path=dtm_arg
        )
        metadata = run_pipeline(pipeline, work, name="classify")
        print(f"  wrote {output} ({output.stat().st_size / 1e6:.1f} MB)")
        stats = check_output(metadata, args.units)
        print(json.dumps({**stats, "surfaces": surfaces}, indent=2, default=str))
        return 0

    with connect() as conn:
        scan = load_scan(conn, args.scan)
        units = scan["units_to_metres"]

        # PREDICTED, not produced -- prepare_ground writes the real file below.
        # The pipeline has to be known before the row is written, and the row
        # has to be written before any work starts.
        dtm_arg = args.dtm or (str(work / DTM_NAME) if method == "slg" else None)
        pipeline = thresholds.build_pipeline(
            scan["source_url"], str(output), units, method=method, dtm_path=dtm_arg
        )

        # Recorded BEFORE the run, so a crash still leaves a row saying what
        # was attempted. A run that vanished without trace is the one thing
        # provenance must not permit.
        with conn.cursor() as cur:
            cur.execute(
                """insert into pipeline_runs (scan_id, pdal_version, pipeline, status)
                   values (%s, %s, %s, 'running') returning id""",
                (scan["id"], version, json.dumps(pipeline)),
            )
            run_id = cur.fetchone()[0]
        conn.commit()

        print(f"  run {run_id}: pdal {version}, {units} m per file unit, method {method}")
        try:
            # Inside the try, so a failure in the surface pass or in the checks
            # between passes marks the run failed rather than leaving it
            # 'running' forever.
            prepare_ground(scan["source_url"], units, work, method, args.dtm, args.resolution)
            metadata = run_pipeline(pipeline, work, name="classify")
            print(f"  wrote {output} ({output.stat().st_size / 1e6:.0f} MB)")
            stats = check_output(metadata, units)
            print(
                f"  ground {stats['ground_fraction'] * 100:.1f}%, "
                f"tallest {stats['hag_max_m']:.1f} m, {stats['point_count']:,} points"
            )

            derived_url = None
            if not args.no_upload:
                dest = args.dest or (
                    f"{os.environ['SCAN_BUCKET'].rstrip('/')}/{args.scan}.annotated.copc.laz"
                    if os.environ.get("SCAN_BUCKET")
                    else None
                )
                if not dest:
                    raise SystemExit("pass --dest or set SCAN_BUCKET, or use --no-upload")
                derived_url = upload(output, dest)
                print(f"  uploaded to {derived_url}")

            with conn.cursor() as cur:
                cur.execute(
                    """update pipeline_runs set status = 'ok', finished_at = now()
                       where id = %s""",
                    (run_id,),
                )
                cur.execute(
                    """insert into scan_stats
                         (run_id, point_count, class_histogram, hag_p50_m, hag_p95_m,
                          hag_max_m, ground_fraction)
                       values (%s, %s, %s, %s, %s, %s, %s)""",
                    (
                        run_id,
                        stats["point_count"],
                        json.dumps(stats["class_histogram"]),
                        stats["hag_p50_m"],
                        stats["hag_p95_m"],
                        stats["hag_max_m"],
                        stats["ground_fraction"],
                    ),
                )
                # Only now does the viewer start serving the derivative --
                # after it has been checked AND uploaded. Pointing the viewer
                # at a URL that does not exist yet would be a broken scan page.
                if derived_url:
                    cur.execute("update scans set derived_url = %s where id = %s", (derived_url, scan["id"]))
            conn.commit()
            print(f"  run {run_id} ok")
            return 0

        except Exception as exc:
            with conn.cursor() as cur:
                cur.execute(
                    """update pipeline_runs set status = 'failed', error = %s, finished_at = now()
                       where id = %s""",
                    (str(exc)[:4000], run_id),
                )
            conn.commit()
            print(f"  run {run_id} FAILED: {exc}", file=sys.stderr)
            return 1


if __name__ == "__main__":
    sys.exit(main())
