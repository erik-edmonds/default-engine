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

# writers.copc gained `extra_dims` in 2.7.0. Everything else in the SMRF path
# is older, so this is the binding constraint there.
REQUIRED_PDAL = (2, 7, 0)

# The SLG path needs a much newer PDAL, and the gap is wide enough to matter.
#
# `writers.gdal`'s percentile output_type arrived in PR #4839, merged
# 2025-11-19. PDAL 2.9.2 was released 2025-09-01 -- and the `pdal/pdal:2.9.2`
# IMAGE contains pdal 2.8.4 -- so the amd64 versioned image cannot compute a
# percentile raster at all. On a build without it the option is rejected rather
# than ignored, which is the good case, but the floor is asserted up front so
# the failure names the real cause.
REQUIRED_PDAL_SLG = (2, 10, 0)

# Maize on 30-inch rows. The paper's field was 0.76 m, and the grid it filtered
# over was 1 m -- deliberately LARGER than the row spacing, so that every cell
# contains both canopy and inter-row soil and therefore has a bare-ground
# return to take a low percentile from. A cell narrower than the row spacing can
# sit entirely within a canopy row and have no ground in it at all.
ROW_SPACING_M = 0.76
GRID_FACTOR = 1.3

# The two percentiles the paper filters on. Percentiles rather than min/max
# because min and max chase single outliers, and a ground surface pulled down
# by one low noise point propagates into every height above it.
GROUND_PERCENTILE = 1
CANOPY_PERCENTILE = 99


def required_pdal(method: str) -> tuple[int, ...]:
    return REQUIRED_PDAL_SLG if method == "slg" else REQUIRED_PDAL


def dtm_resolution_m() -> float:
    return ROW_SPACING_M * GRID_FACTOR

# src/config/hagBands.json, read rather than duplicated. The path is relative
# to this file so the CLI works from any working directory.
BANDS_PATH = Path(__file__).resolve().parent.parent / "src" / "config" / "hagBands.json"

# The ASPRS code PDAL's filters.outlier assigns, and the one filters.smrf uses
# for ground. Named rather than inlined because they appear in several stages
# and a mismatch between them is silent.
NOISE_CLASS = 7
UNCLASSIFIED = 1

# ASPRS 0, "never classified" -- used here for its literal meaning: a point
# whose height could not be determined because the ground surface had no value
# under it. src/config/asprs.ts already draws code 0 in a deliberately
# non-committal grey, so these appear in the viewer as "this viewer does not
# know", which is exactly right.
NEVER_CLASSIFIED = 0

# The raster's own nodata value, set explicitly rather than left to
# writers.gdal's default, because the arithmetic below depends on knowing it.
DTM_NODATA = -9999.0

# What filters.hag_dem is ASKED to write for a nodata pixel.
#
# Positive, and large, for a reason established by measurement rather than by
# reading the documentation -- see NODATA_LEAK_ABOVE.
NODATA_HAG = 1.0e6

# How a nodata cell is actually detected, in file units.
#
# THE DOCUMENTED MECHANISM DOES NOT WORK, and this was measured on pdal 2.10.2
# rather than assumed. filters.hag_dem has two nodata checks in processOne() --
# a `GDALError::NoData` read status and a secondary `val == m_bandNoData` -- and
# on a GeoTIFF written by writers.gdal, which correctly declares
# `NoData Value=-9999`, NEITHER fires for all but a handful of pixels. The
# filter reads -9999 as a real terrain elevation and computes
# `hag = z - (-9999)`, so a nodata cell produces a height of about +10,500 file
# units. Measured on the sample survey: 5,149 points, and
# `max |(hag - 9999) - Z| = 0.0005`, which is the arithmetic confirmed exactly.
#
# A first version of this keyed detection on a large NEGATIVE height, which is
# what `nodata_hag` would produce if it fired. It matched zero points.
#
# So detection is by MAGNITUDE, and `nodata_hag` is set positive too, so that
# the rare pixel the documented path does catch lands in the same place as the
# many it does not. One threshold covers both.
#
# Safe because the two populations are orders of magnitude apart: a real height
# is bounded by MAX_PLAUSIBLE_HAG_M (120 m, 394 ft), while a leak is at least
# |DTM_NODATA| less the terrain elevation -- about 9,500 file units on this
# file. Anything between is unoccupied.
NODATA_LEAK_ABOVE = 5000.0

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
        guard = (
            f"Classification != {ground} && Classification != {NOISE_CLASS}"
            # Never-classified points have no usable height, so they must not
            # fall into a vegetation band. Harmless in the SMRF path, where
            # class 0 never arises.
            f" && Classification != {NEVER_CLASSIFIED}"
        )
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


def reader_stage(source: str) -> dict[str, Any]:
    """The reader, chosen by what the source actually is.

    readers.copc is the right reader for a COPC over HTTP: it fetches by
    octree node over byte ranges and never moves the whole file. It is the
    WRONG reader for a plain LAZ, which it refuses, and the synthetic fields
    this project generates are plain LAZ because that is what a sensor
    delivers -- a COPC is a product of processing, not of scanning.

    Chosen by extension rather than by probing, because a remote COPC would
    have to be fetched to probe it, and `.copc.laz` is the convention the
    format's own specification uses.
    """
    if source.lower().endswith(".copc.laz") or source.lower().startswith(("http", "s3://")):
        # `requests` is the number of concurrent range requests, which only
        # means anything over a network.
        return {"type": "readers.copc", "filename": source, "requests": 16}
    return {"type": "readers.las", "filename": source}


def surface_stage(
    path: str, percentile: int, units_to_metres: float, resolution_m: float | None = None
) -> dict[str, Any]:
    """One percentile raster -- the paper's spatially localized grid, as a
    single PDAL stage.

    `output_type: ["p1"]` is the ground surface and `["p99"]` the top of
    canopy. Two options make this the paper's method rather than something that
    merely resembles it:

      * `binmode: true` is REQUIRED, not a preference. io/GDALWriter.cpp
        refuses percentiles without it ("Can't output percentiles without
        'binmode=true'"). It is also exactly the semantics wanted: only points
        whose centre falls inside the cell count, with no distance-weighted
        smearing between cells, which is what "filtering within each grid cell
        independently" means.

      * `resolution` is the cell size, and it has to exceed the crop's row
        spacing for the low percentile to find any bare ground at all.

    Noise is excluded here rather than tolerated. filters.outlier has already
    classified it as 7, and a single low noise return inside a cell would
    otherwise become that cell's 1st percentile and drag the ground surface --
    and therefore every height above it -- down with it.

    NO `window_size`, AND THAT IS A CHOICE. writers.gdal offers it as a
    fallback interpolation that fills empty cells from their neighbours, which
    would make the nodata leak disappear entirely. It is deliberately not used:
    filling invents a ground elevation underneath points that have no ground
    measurement, and for a product whose value is knowing what was measured,
    "no answer" beats a plausible guess. Those points are marked class 0 and
    counted instead -- 5,149 of 10.65 million on the sample survey, 0.048%.
    If a real crop scan ever came back with a materially larger share, the
    honest fix is a coarser cell, not interpolation.
    """
    metres = dtm_resolution_m() if resolution_m is None else resolution_m
    return {
        "type": "writers.gdal",
        "filename": path,
        "resolution": round(to_file_units(metres, units_to_metres), 4),
        "output_type": [f"p{percentile}"],
        "binmode": True,
        "dimension": "Z",
        "where": f"Classification != {NOISE_CLASS}",
        # Explicit, because filters.hag_dem subtracts this value verbatim from
        # every point over an empty cell -- see NODATA_LEAK_ABOVE. Leaving it to
        # the writer's default would make that arithmetic depend on a number
        # this module never named.
        "nodata": DTM_NODATA,
    }


def hag_dem_stage(raster: str) -> dict[str, Any]:
    """Height above a raster surface.

    NO min_clamp OR max_clamp, AND THAT IS A REVERSAL of what the plan for this
    change said. Both options exist -- which is itself the correction to a note
    elsewhere in this module claiming PDAL cannot clamp -- but using them here
    would be actively harmful: annotate.py's guards detect a broken ground solve
    precisely BY the implausible maximum and the below-ground tail. Clamping
    destroys that evidence and leaves a quietly wrong file that passes every
    check. Clamping and guarding are alternatives, not complements, and for a
    product whose value is provenance the guard is the one worth keeping.

    `zero_ground: false` because at this point in the pipeline nothing is
    classified as ground yet -- the reset blanked it and the SLG method derives
    ground FROM this height rather than before it. Left at its default of true,
    the filter would look for class 2, find none, and the option would do
    nothing while appearing to mean something.

    PDAL DOES NOT CHECK THE RASTER'S SRS OR ITS UNITS. filters/HagDemFilter.cpp
    passes the point's X/Y straight to Raster::read and computes `hag = z - val`
    with no reprojection and no warning. A DTM written from this same cloud is
    therefore safe by construction; a DTM reused from another flight is
    silently wrong if its CRS or vertical unit differs, and points outside its
    extent get no height at all. annotate.py checks both before using one.
    """
    return {
        "type": "filters.hag_dem",
        "raster": raster,
        "band": 1,
        "zero_ground": False,
        "nodata_hag": NODATA_HAG,
    }


def nodata_stage() -> dict[str, Any]:
    """Mark the points the ground surface could not account for.

    MUST RUN BEFORE ground_from_hag_stage. A leaked height is enormous and
    positive, so it fails `HeightAboveGround < nearGround` and would NOT become
    ground -- but it sails past the top vegetation band's open-ended lower
    bound and would be classified as high vegetation, which is just as wrong
    and harder to notice.

    Matched by magnitude rather than by equality: the leaked value is
    `z - DTM_NODATA`, so it differs for every point, and there is no single
    number to compare against. See NODATA_LEAK_ABOVE for why a threshold is
    safe here.
    """
    return {
        "type": "filters.assign",
        "value": (
            f"Classification = {NEVER_CLASSIFIED} "
            f"WHERE HeightAboveGround > {NODATA_LEAK_ABOVE:.1f} "
            # NOISE IS PRESERVED, like it is in reset_stage and band_stage.
            # filters.outlier made a positive determination about these points;
            # "never classified" means "no answer", which is strictly less
            # information, and a reviewer looking for what the classifier
            # rejected would no longer find it. It also matters for the guard:
            # noise is 3.24% of the sample survey and is exactly the population
            # that sits alone in a column -- bird and aircraft returns -- so
            # those cells are nodata and these points would otherwise dominate
            # a count that exists to measure something else entirely.
            f"&& Classification != {NOISE_CLASS}"
        ),
    }


def clear_nodata_hag_stage() -> dict[str, Any]:
    """Replace a leaked nodata height with zero, once it has been counted.

    THE LEAK MUST NOT REACH THE WRITTEN FILE, and this is the stage that stops
    it. Measured on the sample survey, the leaked values run to +10,558 file
    units -- about 3.2 km. Three things break if that ships:

      * The viewer's height colour mode normalises by the maximum height and
        builds its ramp across the observed range. One point at 3.2 km makes
        the real 0-58 m range occupy a half-percent sliver of the ramp, so
        every cloud renders as a single flat colour.
      * check_output's sanity bound trips at 120 m, so the run fails on the
        leak rather than on anything about the survey -- which is exactly what
        happened the first time this ran, and is why these points have to be
        dealt with rather than merely detected.
      * The reported maximum and median would both be meaningless.

    Run AFTER nodata_stage, which needs the leaked value to identify these
    points, and deliberately NOT keyed on class 0 -- a noise point over a
    nodata cell keeps class 7 by the guard above, and still has to have its
    height cleared.

    Zero is the right replacement because class 0 is what carries the meaning:
    "no height" and "at ground level" are then distinguishable by class, which
    is the ordinary way to carry a nodata mask.
    """
    return {
        "type": "filters.assign",
        "value": f"HeightAboveGround = 0 WHERE HeightAboveGround > {NODATA_LEAK_ABOVE:.1f}",
    }


def ground_from_hag_stage(units_to_metres: float) -> dict[str, Any]:
    """Ground is whatever sits at or below the percentile surface.

    THE SLG METHOD'S REPLACEMENT FOR SMRF, and the simplification is the point:
    SMRF is a morphological solve with a slope model, a window and a threshold,
    all of which need tuning per field. Here the ground surface has already
    been computed as a low percentile per cell, so "ground" is just "close to
    it" -- one threshold, in metres, shared with the viewer's legend through
    hagBands.json.

    Points BELOW the surface are included, which is deliberate: a point under
    the 1st-percentile surface is ground that the percentile happened to miss,
    not a new class of object.
    """
    bands = load_bands()
    # CONVERTED, and the first draft of this function was not -- it formatted
    # `nearGroundM` straight into the expression, which on the sample survey
    # would have made the ground threshold 0.1 FEET (3 cm) instead of 0.1 m.
    # HeightAboveGround is in the file's own unit, like every other length PDAL
    # is handed here.
    near = to_file_units(bands["nearGroundM"], units_to_metres)
    return {
        "type": "filters.assign",
        "value": (
            f"Classification = {bands['groundClass']} "
            f"WHERE HeightAboveGround < {near:.4f} "
            f"&& Classification != {NOISE_CLASS} "
            # Without this, every point the DTM could not account for becomes
            # ground. A leaked height does not satisfy `< nearGround`, but a
            # cleared one is exactly 0 and would -- so the guard is what keeps
            # a point with no ground reference from being called ground.
            f"&& Classification != {NEVER_CLASSIFIED}"
        ),
    }


def copc_writer_stage(destination: str, carry_point_id: bool = False) -> dict[str, Any]:
    """The writer.

    `carry_point_id` FORWARDS THE INPUT'S PointId, AND IT IS WHAT MAKES THE
    OUTPUT SCOREABLE. Without it the derivative cannot be joined back to
    anything: COPC reorders every point into its octree, so position in the
    file carries no meaning, and the simulator's ground truth
    (sim/truth.py -> truth.npz) is indexed by PointId. Scoring a run against
    truth therefore needs the key to survive the pipeline, and until this
    existed it did not -- `pdal info --schema` on a derivative showed
    HeightAboveGround and no PointId, while the input it came from had one.

    OFF BY DEFAULT because it is a property of the SOURCE, not a preference.
    Real survey data has no PointId dimension, and naming a dimension in
    `extra_dims` that the stream does not carry is a write-time error -- so
    annotate.py asks the file first and only sets this when the answer is yes.
    """
    extra = "HeightAboveGround=float32"
    if carry_point_id:
        # uint32, matching the simulator's own dtype. The default for an
        # unlisted dimension would be its in-memory type, which for PointId is
        # float64 -- eight bytes to carry an integer, and one that stops being
        # exact above 2^53 for no reason at all.
        extra += ",PointId=uint32"
    return {
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
        "extra_dims": extra,
    }


def build_surface_pipeline(
    source: str, dtm_path: str, csm_path: str, units_to_metres: float, resolution_m: float | None = None
) -> list[dict[str, Any]]:
    """PASS ONE of the SLG method: the two percentile rasters.

    WHY THERE ARE TWO PASSES AT ALL, since it is the first thing that looks
    like an oversight. A PDAL pipeline may contain several writers, but "they
    must operate sequentially" -- so emitting both rasters from one run is fine,
    and that is what this does. What one run cannot do is emit a raster and
    then read it back: filters.hag_dem opens the file in ready(), and inside a
    single pipeline the raster is not finished until its writer closes. The
    split is forced by that data dependency, not by a limitation of the tool.

    Both rasters come from the same filtered stream, so the ground and canopy
    surfaces are guaranteed to be on the same grid and to have seen the same
    points -- which is what makes CSM minus DTM a crop height rather than two
    unrelated interpolations subtracted.
    """
    return [
        reader_stage(source),
        outlier_stage(),
        reset_stage(),
        surface_stage(dtm_path, GROUND_PERCENTILE, units_to_metres, resolution_m),
        surface_stage(csm_path, CANOPY_PERCENTILE, units_to_metres, resolution_m),
    ]


def build_pipeline(
    source: str,
    destination: str,
    units_to_metres: float,
    method: str = "smrf",
    dtm_path: str | None = None,
    carry_point_id: bool = False,
) -> list[dict[str, Any]]:
    """The classification pipeline, as PDAL's list-of-stages form.

    TWO GROUND METHODS, AND THE OLD ONE IS KEPT ON PURPOSE rather than being
    replaced. `method="smrf"` is the Phase 2 chain, which §0 measured at 73.7%
    ground on the stadium sample with a -31 m below-ground tail.
    `method="slg"` is the paper's percentile-grid method and needs a DTM from
    build_surface_pipeline. A number like 73.7% only means something next to an
    alternative, so both stay runnable on the same file.

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
    if method not in ("smrf", "slg"):
        raise ValueError(f"unknown ground method {method!r}; expected 'smrf' or 'slg'")
    if method == "slg" and not dtm_path:
        raise ValueError("method 'slg' needs dtm_path -- run build_surface_pipeline first")

    head: list[dict[str, Any]] = [
        reader_stage(source),
        outlier_stage(),
        reset_stage(),
    ]

    if method == "smrf":
        # Ground is solved morphologically, then height is measured from the
        # points SMRF labelled.
        ground: list[dict[str, Any]] = [
            smrf_stage(units_to_metres),
            hag_stage(units_to_metres),
        ]
    else:
        # Height comes first, from the percentile surface, and ground is
        # derived from it. The inversion is the whole difference between the
        # two methods.
        ground = [
            hag_dem_stage(dtm_path),  # type: ignore[arg-type]
            # Order matters three times over. nodata is marked BEFORE the
            # height is cleared, because marking is what needs the leaked
            # value; ground is derived AFTER both, because a cleared height of
            # 0 would otherwise qualify as ground; and all of it happens before
            # any stats stage, so nothing reports a 3 km height.
            nodata_stage(),
            clear_nodata_hag_stage(),
            ground_from_hag_stage(units_to_metres),
        ]

    return [
        *head,
        *ground,
        band_stage(units_to_metres),
        stats_stage(),
        below_ground_stage(units_to_metres),
        copc_writer_stage(destination, carry_point_id),
    ]
