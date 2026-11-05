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


def pdal_version() -> tuple[str, tuple[int, ...]]:
    out = subprocess.run(["pdal", "--version"], capture_output=True, text=True, check=True).stdout
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", out)
    if not match:
        raise RuntimeError(f"could not read a version out of: {out.strip()!r}")
    return match.group(0), tuple(int(g) for g in match.groups())


def require_pdal() -> str:
    text, parts = pdal_version()
    if parts < thresholds.REQUIRED_PDAL:
        need = ".".join(str(n) for n in thresholds.REQUIRED_PDAL)
        raise SystemExit(
            f"PDAL {text} is too old: writers.copc gained `extra_dims` in {need}.\n"
            "On an older build the height dimension is silently NOT written and the\n"
            "pipeline still reports success. Use the pinned image: pdal/pdal:2.10.2"
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


def run_pipeline(pipeline: list[dict[str, Any]], out_dir: Path) -> dict[str, Any]:
    """Run PDAL and return its metadata.

    Via the `pdal pipeline` CLI rather than the Python bindings, for one
    reason: `--metadata` writes a file that is the complete record of what each
    stage actually did, which is what the checks below and the provenance row
    both need. The bindings expose the same thing less directly.
    """
    spec = out_dir / "pipeline.json"
    meta = out_dir / "metadata.json"
    spec.write_text(json.dumps({"pipeline": pipeline}, indent=2))

    proc = subprocess.run(
        ["pdal", "pipeline", str(spec), "--metadata", str(meta)],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"pdal failed ({proc.returncode}):\n{proc.stderr.strip()}")
    return json.loads(meta.read_text())


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

    return {
        "point_count": total,
        "class_histogram": classes,
        "ground_fraction": ground / total,
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
    args = ap.parse_args()

    if not args.scan and not args.source:
        ap.error("pass --scan to read the registry, or --source with --units to bypass it")
    if args.source and args.units is None:
        ap.error("--source needs --units: metres per file unit, 0.3048 for a survey in US feet")

    name = args.scan or Path(urlparse(args.source).path).name.split(".")[0] or "scan"

    # --dry-run needs neither PDAL nor a database, so the pipeline can be
    # reviewed anywhere. The scan's units are the only input.
    if args.dry_run:
        units = args.units if args.units is not None else float(os.environ.get("UNITS_TO_METRES", "0.3048"))
        pipeline = thresholds.build_pipeline(
            args.source or f"s3://example/{name}.copc.laz",
            f"/scratch/{name}.annotated.copc.laz",
            units,
        )
        print(json.dumps({"pipeline": pipeline}, indent=2))
        return 0

    version = require_pdal()

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
        pipeline = thresholds.build_pipeline(args.source, str(output), args.units)
        print(f"  pdal {version}, {args.units} m per file unit, registry bypassed")
        metadata = run_pipeline(pipeline, work)
        print(f"  wrote {output} ({output.stat().st_size / 1e6:.1f} MB)")
        stats = check_output(metadata, args.units)
        print(json.dumps(stats, indent=2))
        return 0

    with connect() as conn:
        scan = load_scan(conn, args.scan)
        units = scan["units_to_metres"]

        pipeline = thresholds.build_pipeline(scan["source_url"], str(output), units)

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

        print(f"  run {run_id}: pdal {version}, {units} m per file unit")
        try:
            metadata = run_pipeline(pipeline, work)
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
