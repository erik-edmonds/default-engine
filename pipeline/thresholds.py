"""Agronomic thresholds, in file units, and the PDAL stages that use them.

WHY THIS IS A MODULE AND NOT A STATIC PIPELINE JSON. Every length PDAL is
given here -- SMRF's cell and window, the HAG search radius, the vegetation
band edges -- is in the FILE's linear unit. The sample survey is in US survey
feet; a crop scan may be in either. A threshold written as a literal is
therefore a threshold that is wrong for the next file, and wrong by a factor
of 3.28 while looking entirely reasonable.

So the bands are authored once, in metres, in src/config/hagBands.json, and
converted here. That same JSON is imported by src/config/asprs.ts to draw the
viewer's legend and height ramp, which is the only reason the two can be
trusted to agree about what "medium vegetation" means.

PDAL VERSION DETAILS THAT ARE NOT OPTIONAL, each verified against the docs and
the PDAL source rather than assumed:

  * `extra_dims` on writers.copc did not exist before PDAL 2.7.0. On an older
    build the option is ignored and the height dimension is silently not
    written -- the pipeline succeeds and the product is useless. See
    REQUIRED_PDAL.

  * filters.smrf has no `last` option; it is `returns`. And its documented
    `window` default of 18.0 is misleading: the source computes `18 * cell`
    when window is not set, so setting cell for feet silently scales window
    too. Both are therefore set explicitly.

  * filters.hag_nn's `allow_extrapolation` is documented as defaulting to
    False and actually defaults to True in the source. Set explicitly.

  * PDAL's expression language has NO FUNCTIONS -- no min, no max, no abs.
    That is why nothing here tries to clamp arithmetically, and why the height
    dimension is written as float32 rather than as a scaled integer.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

# writers.copc gained `extra_dims` in 2.7.0. Everything else used here is
# older, so this is the binding constraint.
REQUIRED_PDAL = (2, 7, 0)

# src/config/hagBands.json, read rather than duplicated. The path is relative
# to this file so the CLI works from any working directory.
BANDS_PATH = Path(__file__).resolve().parent.parent / "src" / "config" / "hagBands.json"

# The ASPRS code PDAL's filters.outlier assigns, and the one filters.smrf uses
# for ground. Named rather than inlined because they appear in several stages
# and a mismatch between them is silent.
NOISE_CLASS = 7
UNCLASSIFIED = 1

# SMRF's own defaults, in METRES, which is the unit they were tuned in. Only
# the lengths are converted; slope is a rise over run and scalar is a
# multiplier, so both are unitless.
SMRF_CELL_M = 1.0
SMRF_WINDOW_M = 18.0
SMRF_THRESHOLD_M = 0.5
SMRF_SLOPE = 0.15
SMRF_SCALAR = 1.25

# How far filters.hag_nn may look for ground beneath a point, in metres. A
# guard rather than a tuned value: without it, a point over a gap in the ground
# returns takes its height from whatever ground happens to be nearest, which on
# the edge of a scan can be hundreds of metres away.
HAG_MAX_DISTANCE_M = 5.0
HAG_NEIGHBOURS = 12

# Statistical outlier removal. Unitless, so no conversion.
OUTLIER_MEAN_K = 12
OUTLIER_MULTIPLIER = 2.5

# How far below the solved ground surface a point may sit before it counts as
# evidence the ground solve is wrong, in metres.
#
# WHY A COUNT AND NOT JUST A MINIMUM. The stadium sample's single deepest point
# is 31 m below ground, which sounds catastrophic and is not: only 649 points of
# 10.65 million (0.006%) are more than a metre under. A guard on the extreme
# value alone would fail a good file on 19 stray points, and a guard on nothing
# would have passed a file whose ground surface had collapsed. So the pipeline
# counts them and the guard trips on the FRACTION.
BELOW_GROUND_LIMIT_M = 1.0
BELOW_GROUND_MAX_FRACTION = 0.005


def load_bands() -> dict[str, Any]:
    with BANDS_PATH.open() as f:
        return json.load(f)


def to_file_units(metres: float, units_to_metres: float) -> float:
    """Metres -> the file's own linear unit.

    `units_to_metres` is metres PER file unit (0.3048 for a survey in feet), so
    this divides. Getting the direction wrong is the single easiest mistake
    here and produces a pipeline that runs happily with every threshold off by
    10.8x in the wrong direction.
    """
    if units_to_metres <= 0:
        raise ValueError(f"units_to_metres must be positive, got {units_to_metres}")
    return metres / units_to_metres


def smrf_stage(units_to_metres: float) -> dict[str, Any]:
    cell = to_file_units(SMRF_CELL_M, units_to_metres)
    return {
        "type": "filters.smrf",
        # CELL MUST NOT BE LEFT AT ITS DEFAULT ON A FILE IN FEET. SMRF
        # allocates roughly eight full rasters of (extentX/cell) x
        # (extentY/cell). A square-mile field at cell=1.0 in feet is 5280 x
        # 5280 = 27.9M cells and several gigabytes of Eigen temporaries; the
        # same field at cell=3.28 (one metre) is 2.6M cells and a few hundred
        # megabytes. This is the difference between fitting in 16GB and not.
        "cell": round(cell, 4),
        # Explicit because the real default is `18 * cell`, not the documented
        # 18.0 -- so it would otherwise track cell silently.
        "window": round(to_file_units(SMRF_WINDOW_M, units_to_metres), 4),
        "threshold": round(to_file_units(SMRF_THRESHOLD_M, units_to_metres), 4),
        "slope": SMRF_SLOPE,
        "scalar": SMRF_SCALAR,
        # REQUIRED, NOT DEFENSIVE. SMRF writes `other_class` to everything it
        # decides is not ground, so without this it would overwrite the noise
        # classification filters.outlier just produced and the noise would
        # re-enter the ground solve on the next run.
        "ignore": f"Classification[{NOISE_CLASS}:{NOISE_CLASS}]",
        # Ground is a last or only return. A first return off a canopy is not
        # the ground under it, and letting SMRF consider it drags the ground
        # surface up into the crop.
        "returns": ["last", "only"],
        "ground_class": 2,
        "other_class": UNCLASSIFIED,
    }


def reset_stage() -> dict[str, Any]:
    """Blank the incoming classification before reclassifying.

    THIS IS NOT REDUNDANT WITH SMRF, and leaving it out produces the worst
    possible result for a QA deliverable: a file whose labels are PARTLY ours
    and partly whoever classified it before.

    Two routes let an input label survive to the output. SMRF only writes
    `other_class` to points it actually considered, and points excluded by
    `returns` -- every first and intermediate return, under the setting above
    -- are not considered, so they keep whatever class the input gave them.
    And the band assignments below deliberately skip anything already marked
    ground or noise.

    The sample survey is `autzen-classified.copc.laz`: already classified, by
    someone else, to an unknown standard. Starting from a known state is the
    only way the output means what the provenance row says it means.
    """
    return {
        "type": "filters.assign",
        "value": f"Classification = {UNCLASSIFIED} WHERE Classification != {NOISE_CLASS}",
    }


def outlier_stage() -> dict[str, Any]:
    return {
        "type": "filters.outlier",
        "method": "statistical",
        "mean_k": OUTLIER_MEAN_K,
        "multiplier": OUTLIER_MULTIPLIER,
        # Classifies as NOISE_CLASS; it does not delete. Keeping the points
        # rather than dropping them is deliberate -- a QA reviewer needs to see
        # what the classifier called noise in order to disagree with it.
    }


def hag_stage(units_to_metres: float) -> dict[str, Any]:
    return {
        "type": "filters.hag_nn",
        "count": HAG_NEIGHBOURS,
        "max_distance": round(to_file_units(HAG_MAX_DISTANCE_M, units_to_metres), 4),
        # Documented as False, actually True in the source. Extrapolating past
        # the ground returns invents heights at the edge of the scan.
        "allow_extrapolation": False,
        "class": 2,
    }


def band_stage(units_to_metres: float) -> dict[str, Any]:
    """Vegetation classes from height above ground.

    The statements are applied in order and later ones see the results of
    earlier ones, so each guards ground and noise explicitly rather than
    relying on ordering. Band edges are min-inclusive and max-exclusive, which
    is what `>=` and `<` give -- and is what `bandForHeight` in
    src/config/asprs.ts asserts, so the viewer's legend and this agree at the
    boundaries.
    """
    bands = load_bands()
    ground = bands["groundClass"]
    statements: list[str] = []
    for band in bands["bands"]:
        lo = to_file_units(band["minM"], units_to_metres)
        guard = f"Classification != {ground} && Classification != {NOISE_CLASS}"
        if band["maxM"] is None:
            where = f"HeightAboveGround >= {lo:.4f} && {guard}"
        else:
            hi = to_file_units(band["maxM"], units_to_metres)
            where = f"HeightAboveGround >= {lo:.4f} && HeightAboveGround < {hi:.4f} && {guard}"
        statements.append(f"Classification = {band['class']} WHERE {where}")
    return {"type": "filters.assign", "value": statements}


def stats_stage() -> dict[str, Any]:
    """Class counts and height distribution, measured during the run itself.

    REPLACES TWO `pdal info` SUBPROCESS CALLS THAT WERE BOTH WRONG. They passed
    `--stat`, which is not an option -- it is `--stats` -- so the guard crashed
    with a CalledProcessError after the derivative had already been written.
    And even corrected they would have been wrong twice over: `pdal info
    --stats` emits no per-value counts at all (that needs this filter's `count`
    option, or `info --enumerate`), and it emits no median unless `global` is
    asked for, so the p50 recorded for every scan would have been the 0.0
    default of a `.get("median", 0.0)` -- a plausible number that was never
    measured.

    Reading the run's own metadata instead is also one pass rather than three:
    the old helpers re-opened and re-scanned the finished file twice.

    `count` yields both a `bins` dict and a `counts` array of "value/count"
    strings; `global` yields median and MAD.
    """
    return {
        "type": "filters.stats",
        "count": "Classification",
        "global": "HeightAboveGround",
        "dimensions": "Classification,HeightAboveGround",
    }


def below_ground_stage(units_to_metres: float) -> dict[str, Any]:
    """Count the points sitting implausibly far below the ground surface.

    A SECOND filters.stats, and the duplication is deliberate: `where` applies
    to a whole stage, so a filtered count cannot share a stage with the
    unfiltered statistics.

    Note that PDAL keys pipeline metadata by stage TYPE and ignores `tag` when
    doing so -- two stats stages arrive as a LIST under `filters.stats`, not as
    two named entries. annotate.py therefore identifies them by content rather
    than by position, because position is the kind of thing a later edit
    silently reorders.
    """
    limit = to_file_units(BELOW_GROUND_LIMIT_M, units_to_metres)
    return {
        "type": "filters.stats",
        "dimensions": "HeightAboveGround",
        "where": f"HeightAboveGround < -{limit:.5f}",
    }


def build_pipeline(source: str, destination: str, units_to_metres: float) -> list[dict[str, Any]]:
    """The whole pipeline, as PDAL's list-of-stages form.

    NO "comment" KEYS. They are not a documented PDAL option -- some versions
    ignore unknown keys and others reject them -- so the reasoning lives in
    this module and the emitted JSON stays strictly valid.

    readers.copc reads S3 directly: arbiter is always built into PDAL and
    supports IMDSv2, so an EC2 instance profile is enough and no credentials
    need to enter the container.

    writers.copc CANNOT write to S3. It opens a local stream and seeks
    backwards to patch the header and EVLR offsets once the octree is built, so
    the destination is always a local path and annotate.py uploads afterwards.
    """
    return [
        {"type": "readers.copc", "filename": source, "requests": 16},
        outlier_stage(),
        reset_stage(),
        smrf_stage(units_to_metres),
        hag_stage(units_to_metres),
        band_stage(units_to_metres),
        stats_stage(),
        below_ground_stage(units_to_metres),
        {
            "type": "writers.copc",
            "filename": destination,
            # Carries the input's SRS and scale/offset through.
            "forward": "all",
            # FLOAT32, NOT A SCALED INTEGER, and this is a considered reversal
            # of the compact choice. An int16 in centimetres would need two
            # extra WHERE-conditioned assigns to clamp (PDAL's expressions have
            # no min/max), would be in centi-FEET on this file unless converted
            # by 30.48 rather than 100, and an out-of-range value does not warn
            # -- getFieldAs<int16_t> throws, aborting the write after every
            # expensive stage has already run. float32 costs two bytes per
            # point and removes all four hazards. `extra_dims: "all"` would be
            # worse than either: it writes the dimension at its in-memory type,
            # which is float64.
            "extra_dims": "HeightAboveGround=float32",
        },
    ]
