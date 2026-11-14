"""Find the crop rows, and give every point a position relative to them.

WHY THIS IS THE CENTRE OF A LiDAR-ONLY CORN PIPELINE. Telling a weed from a
maize plant is easy with a multispectral camera and hard with a laser: both
are green vegetation a few tens of centimetres tall, and at 905 nm their
reflectance is nearly the same. What separates them is not what they are made
of but WHERE THEY ARE. Maize is planted on a grid -- 0.76 m between rows, 15
or 16 cm along them -- and weeds are not. A plant centred between two rows is
a weed almost regardless of what it looks like.

So `row_offset`, the signed distance from the nearest row centre, is the
strongest single feature available, and it cannot be computed without first
solving for where the rows are. Nothing here is trained: the row geometry is
recovered from the cloud's own periodicity, so it works on a real field on the
first flight, with no labels.

The method, in the order it runs:

  1. Heading, from the direction in which vegetation density is most strongly
     periodic. A rotating projection and a one-dimensional spectrum, which is
     robust in a way that a Hough transform over a sparse point set is not.
  2. Spacing and phase, from the dominant period in that direction.
  3. Each row's actual centre line, by fitting a gentle curve to the plants
     assigned to it -- because real rows are not perfectly straight and the
     synthetic ones are deliberately not either.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

# Vegetation taller than this is what rows are detected from. Low enough to
# include a small maize seedling, high enough to exclude the ground itself and
# the clods on it.
MIN_VEGETATION_M = 0.08

# The bin width for the density profile, in metres. Fine enough to resolve a
# 0.70 m row spacing with about a dozen samples per period, coarse enough that
# a sparse cloud still puts points in most bins.
PROFILE_BIN_M = 0.05

# Row spacings to look for, in metres. 0.38 is twin-row maize, 0.76 is the US
# standard, 0.50 and 0.75-0.80 cover European practice; the window is
# generous rather than tight because a wrong answer here is obvious (the
# recovered spacing disagrees with the configured one) while a missed one is
# not.
MIN_SPACING_M = 0.30
MAX_SPACING_M = 1.20

# Step of the period scan, in metres. Half a centimetre: finer than the
# spacing needs to be known for anything downstream, and the scan is a single
# vectorised pass.
PERIOD_STEP_M = 0.005

# A period scoring within this fraction of the best is treated as equally
# good, and the largest such period wins -- see _best_period on harmonics.
HARMONIC_TOLERANCE = 0.9

# Points used for the heading and period search. The answer is two numbers;
# fifty thousand points determine them far past the precision that matters.
SEARCH_SAMPLE = 50_000

# Points and period step for the coarse heading scan, which only has to land
# within one grid step of the answer.
COARSE_SAMPLE = 4_000
COARSE_PERIOD_STEP_M = 0.02

# Refuse a row solution weaker than this. The statistic is 2 n R^2, which has
# a mean of about 1 when there is no periodic structure, so this is four
# orders of magnitude above noise and still three below what a real field
# gives.
MIN_ROW_STRENGTH = 100.0

# Along-row spacing of the knots that trace each row's centre. Two metres
# follows a contour-planted row without being free enough to chase the stand's
# own gaps.
KNOT_SPACING_M = 2.0

# A row needs this many nearby vegetation points before its centre line is
# traced at all, and a knot cell this many before it is believed rather than
# interpolated across.
MIN_POINTS_PER_ROW = 20
MIN_POINTS_PER_CELL = 5


@dataclass
class RowGeometry:
    """Where the rows are.

    `heading` is the direction of the rows in radians, anticlockwise from +x,
    `spacing` the cross-row period in metres, and `offset` the cross-row
    coordinate of row 0.

    `knots` and `lines` hold each row's actual centre line: `lines[r, k]` is
    how far row r departs from `offset + spacing * r` at along-position
    `knots[k]`, interpolated linearly between knots.

    A KNOTTED LINE RATHER THAN A POLYNOMIAL, and the reason is measured. The
    first version fitted a quadratic per row, which cannot represent a field
    whose rows follow a contour over any distance -- on a test field bending
    0.25 m with an 18 m wavelength it was not merely imprecise, it made the
    offsets WORSE than assuming the rows were straight.

    It also makes the heading cheap to be slightly wrong about. A straight
    axis is a poor fit to curved rows -- on that same field the Rayleigh score
    at the true heading was 0.16 against 0.49 at a heading tilted by 2.3
    degrees, so the solve prefers the tilt and is right to -- and a tilt is
    just a linear term the centre lines absorb.
    """

    heading: float
    spacing: float
    offset: float
    count: int
    knots: np.ndarray = field(default_factory=lambda: np.zeros(0))
    lines: np.ndarray = field(default_factory=lambda: np.zeros((0, 0)))
    # The Rayleigh statistic of the solve: see _strength.
    strength: float = 0.0

    @property
    def along_axis(self) -> np.ndarray:
        return np.array([math.cos(self.heading), math.sin(self.heading)])

    @property
    def across_axis(self) -> np.ndarray:
        return np.array([-math.sin(self.heading), math.cos(self.heading)])

    @property
    def fitted(self) -> bool:
        return len(self.knots) >= 2 and self.lines.size > 0

    def project(self, x, y) -> tuple[np.ndarray, np.ndarray]:
        """(along, across) coordinates of points, in metres."""
        xy = np.column_stack([np.asarray(x, dtype=float), np.asarray(y, dtype=float)])
        return xy @ self.along_axis, xy @ self.across_axis

    def centre_of(self, row, along) -> np.ndarray:
        """The cross-row coordinate of a row's centre at a given along position."""
        row = np.asarray(row)
        base = self.offset + self.spacing * row
        if not self.fitted:
            return base
        along = np.asarray(along, dtype=float)
        r = np.clip(row, 0, self.lines.shape[0] - 1)
        k = np.clip(np.searchsorted(self.knots, along) - 1, 0, len(self.knots) - 2)
        span = self.knots[k + 1] - self.knots[k]
        fraction = np.clip((along - self.knots[k]) / np.where(span > 0, span, 1.0), 0.0, 1.0)
        low = self.lines[r, k]
        high = self.lines[r, k + 1]
        return base + low + fraction * (high - low)

    def assign(self, x, y) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Nearest row, signed cross-row offset, and along-row coordinate.

        The offset is signed and in metres: zero on the row centre, half a
        spacing midway between rows. Its ABSOLUTE value is what distinguishes
        a crop from a weed; the sign carries which side, which a classifier
        has no use for but a row-quality report does.
        """
        along, across = self.project(x, y)
        last = max(self.count - 1, 0)
        if not self.fitted:
            row = np.clip(np.rint((across - self.offset) / self.spacing).astype(np.int32), 0, last)
            return row, across - self.centre_of(row, along), along

        # ROWS BEND TOGETHER, so the first guess subtracts the departure
        # common to all of them at this along position -- a field following a
        # contour shifts bodily, and ignoring that costs a whole row index
        # wherever the shift passes half a spacing.
        k = np.clip(np.searchsorted(self.knots, along) - 1, 0, len(self.knots) - 2)
        span = self.knots[k + 1] - self.knots[k]
        fraction = np.clip((along - self.knots[k]) / np.where(span > 0, span, 1.0), 0.0, 1.0)
        mean_line = self.lines.mean(axis=0)
        shift = mean_line[k] + fraction * (mean_line[k + 1] - mean_line[k])
        row = np.clip(np.rint((across - self.offset - shift) / self.spacing).astype(np.int32), 0, last)

        # Then pick the best of that row and its two neighbours against their
        # OWN centre lines. Stepping by whole rows -- what this did first --
        # cannot reach a row whose traced centre is nearest unless the
        # departure exceeds half a spacing, so a row that wanders less than
        # that was never recovered. Three candidates is exact unless rows
        # cross, which planted rows do not.
        best_row = row
        best_distance = np.abs(across - self.centre_of(row, along))
        for step in (-1, 1):
            candidate = np.clip(row + step, 0, last)
            distance = np.abs(across - self.centre_of(candidate, along))
            closer = distance < best_distance
            best_row = np.where(closer, candidate, best_row).astype(np.int32)
            best_distance = np.where(closer, distance, best_distance)
        return best_row, across - self.centre_of(best_row, along), along


def _rayleigh(across: np.ndarray, period: float) -> tuple[float, float]:
    """How concentrated positions are modulo `period`, and where the crest is.

    THE WHOLE ESTIMATE RESTS ON THIS ONE LINE, and it replaced a histogram and
    an FFT because those could not do the job. A binned profile has to choose
    a grid origin, and the obvious choice -- the minimum of the projected
    coordinate -- MOVES as the candidate heading rotates. Rows then alternately
    land on bin centres or straddle them, and the objective being maximised
    becomes an aliasing artefact: measured on a synthetic field whose true
    heading was 0, the binned score read 4,697 at 0 degrees and 19,379 at
    -0.75 degrees. No amount of refinement finds the right answer to the wrong
    question.

    The circular mean of exp(2 pi i a / T) has no grid and no window. It is
    smooth in both the heading and the period, exact at any period rather than
    quantised to a frequency bin, and its argument is the phase -- so the row
    positions come out of the same number as the score, with no second step to
    get out of step with the first.

    Returns (R, crest). R is 0 for positions spread evenly through the period
    and 1 for positions all at the same phase.
    """
    z = np.exp((2j * math.pi / period) * across).mean()
    return float(abs(z)), float(period * np.angle(z) / (2 * math.pi))


def _strength(r: float, count: int) -> float:
    """The Rayleigh test statistic, 2 n R^2.

    Scaled this way the number means something: for positions with no periodic
    structure at all it is approximately exponentially distributed with a mean
    of 1, so MIN_ROW_STRENGTH is not a tuned threshold but a significance
    level. A real field returns thousands.
    """
    return 2.0 * count * r * r


def _best_period(across: np.ndarray, step: float = PERIOD_STEP_M) -> tuple[float, float, float]:
    """(period, R, crest) for the best row spacing in the plausible band.

    HARMONICS ARE THE TRAP HERE. Positions concentrated modulo 0.76 m are also
    concentrated modulo 0.38 m -- every row sits at phase zero in both -- so
    the raw maximum of R prefers the smallest divisor in the band and would
    report half the true spacing.

    The acceptable periods therefore form a few separated bands: one around
    the fundamental and one around each submultiple. The LAST band is the
    fundamental's, and the answer is that band's PEAK. Taking the largest
    acceptable period instead -- which is what this did first -- lands on the
    shoulder rather than the summit and reported every spacing 1.5 to 2 cm
    too wide.
    """
    periods = np.arange(MIN_SPACING_M, MAX_SPACING_M + 1e-9, step)
    z = np.exp((2j * math.pi) * (across[:, None] / periods[None, :])).mean(axis=0)
    r = np.abs(z)

    acceptable = np.flatnonzero(r >= HARMONIC_TOLERANCE * r.max())
    runs = np.split(acceptable, np.flatnonzero(np.diff(acceptable) > 1) + 1)
    band = runs[-1]
    k = int(band[np.argmax(r[band])])
    return float(periods[k]), float(r[k]), float(periods[k] * np.angle(z[k]) / (2 * math.pi))


def solve(
    x, y, hag, min_vegetation_m: float = MIN_VEGETATION_M, bin_m: float = PROFILE_BIN_M
) -> RowGeometry:
    """Recover the row geometry from a classified-nothing point cloud.

    Only `hag` is used to decide what counts as vegetation, so this runs
    directly after the ground stage and before anything is classified -- which
    is the point: the row solution is an INPUT to classification, not a
    product of it.
    """
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    hag = np.asarray(hag, dtype=float)
    vegetation = hag >= min_vegetation_m
    if vegetation.sum() < 50:
        raise RuntimeError(
            f"only {int(vegetation.sum())} points are above {min_vegetation_m} m -- "
            "either the ground solve failed or this is bare soil"
        )
    vx, vy = x[vegetation], y[vegetation]

    # A SUBSAMPLE FOR THE SEARCH. Estimating a heading and a period does not
    # need two hundred thousand points, and the period scan is a matrix of
    # points by candidate periods -- so the cost of using all of them is paid
    # for nothing. The final values are recomputed on every point below.
    rng = np.random.default_rng(0)
    sample = (
        rng.choice(len(vx), SEARCH_SAMPLE, replace=False) if len(vx) > SEARCH_SAMPLE else slice(None)
    )
    sx, sy = vx[sample], vy[sample]

    # Heading and period are nearly separable, so they are solved in turn:
    # the period from a coarse-best heading, then the heading at that period,
    # then both again. Two rounds move the heading by well under a tenth of a
    # degree on the test fields, which is why there is no third.
    coarse = np.arange(0.0, math.pi, math.radians(2.0))
    period = 0.0
    best = (0.0, 0.0, 0.0, -1.0)
    for round_index in range(2):
        if period <= 0:
            # First pass: the heading with the strongest structure at ANY
            # period in the band. Deliberately cheap -- a few thousand points
            # and a coarse period step -- because it only has to get within
            # two degrees, and the band is scanned at every candidate heading.
            # Run at full resolution this was eleven seconds a field.
            coarse_sample = sx[:COARSE_SAMPLE], sy[:COARSE_SAMPLE]
            for heading in coarse:
                across = -math.sin(heading) * coarse_sample[0] + math.cos(heading) * coarse_sample[1]
                candidate, r, crest = _best_period(across, COARSE_PERIOD_STEP_M)
                if r > best[3]:
                    best = (float(heading), candidate, crest, r)
            period = best[1]
            continue

        # Later passes: the heading at a known period, finely, then the period
        # again at the new heading.
        centre, span, step = best[0], math.radians(2.5), math.radians(0.05)
        for heading in np.arange(centre - span, centre + span + step / 2, step):
            across = -math.sin(heading) * sx + math.cos(heading) * sy
            r, crest = _rayleigh(across, period)
            if r > best[3]:
                best = (float(heading), period, crest, r)
        across = -math.sin(best[0]) * sx + math.cos(best[0]) * sy
        period, r, crest = _best_period(across)
        best = (best[0], period, crest, r)

    # Recomputed on EVERY vegetation point, at the solved heading and period:
    # the search ran on a subsample, and the phase is what every row position
    # downstream is measured from.
    heading = best[0]
    across_all = -math.sin(heading) * vx + math.cos(heading) * vy
    r, crest = _rayleigh(across_all, best[1])
    best = (heading, best[1], crest, _strength(r, len(across_all)))

    heading, spacing, offset, strength = best
    if spacing <= 0:
        raise RuntimeError("no periodic structure found: this does not look like a row crop")

    # Re-express the phase as the first row at or above the cloud's edge, so
    # row indices start at 0 on the real first row rather than wherever the
    # cosine happened to crest.
    _, across = RowGeometry(heading, spacing, 0.0, 0).project(vx, vy)
    first = math.ceil((across.min() - offset) / spacing - 0.5)
    last = math.floor((across.max() - offset) / spacing + 0.5)
    offset = offset + first * spacing
    count = max(int(last - first) + 1, 1)
    return RowGeometry(heading=heading % math.pi, spacing=spacing, offset=offset, count=count, strength=strength)


def fit_centrelines(
    geometry: RowGeometry,
    x,
    y,
    hag,
    min_vegetation_m: float = MIN_VEGETATION_M,
    knot_spacing_m: float = KNOT_SPACING_M,
    rounds: int = 3,
) -> RowGeometry:
    """Trace where each row's centre actually runs.

    Along the field in `knot_spacing_m` steps, each row's centre is the MEDIAN
    cross-row position of the vegetation assigned to it. A median rather than
    a mean because the vegetation assigned to a row includes the weeds growing
    beside it, and a mean follows them; with weeds a minority within a third
    of a spacing of the row, the median does not move.

    Iterated, because the assignment depends on the centre lines and the
    centre lines on the assignment. Three rounds is enough that nothing moves
    on the test fields; a round that changes no assignment stops early.
    """
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    vegetation = np.asarray(hag, dtype=float) >= min_vegetation_m
    vx, vy = x[vegetation], y[vegetation]
    if len(vx) < 50:
        return geometry

    along, across = geometry.project(vx, vy)
    lo, hi = float(along.min()), float(along.max())
    count = max(int(math.ceil((hi - lo) / knot_spacing_m)), 1)
    knots = np.linspace(lo, hi, count + 1)
    # Which knot interval each point sits in, for the median per cell.
    cell = np.clip(np.searchsorted(knots, along) - 1, 0, count - 1)

    current = RowGeometry(
        heading=geometry.heading, spacing=geometry.spacing, offset=geometry.offset,
        count=geometry.count, strength=geometry.strength,
    )
    previous: np.ndarray | None = None
    for _ in range(rounds):
        row, offset, _ = current.assign(vx, vy)
        if previous is not None and np.array_equal(row, previous):
            break
        previous = row

        # Only points close to their row inform where that row runs: a point
        # halfway to the next row is as likely a weed as a leaf.
        near = np.abs(offset) < geometry.spacing / 3.0
        departure = across - (geometry.offset + geometry.spacing * row)

        lines = np.zeros((geometry.count, count + 1))
        for r in range(geometry.count):
            in_row = near & (row == r)
            if in_row.sum() < MIN_POINTS_PER_ROW:
                continue
            # Median departure per cell, then knots at cell boundaries. A cell
            # with too few points is left to be filled by interpolation from
            # its neighbours, which is what a gap in the stand should do.
            values = np.full(count, np.nan)
            cells = cell[in_row]
            d = departure[in_row]
            order = np.argsort(cells, kind="stable")
            cells, d = cells[order], d[order]
            edges = np.searchsorted(cells, np.arange(count + 1))
            for c in range(count):
                segment = d[edges[c]:edges[c + 1]]
                if len(segment) >= MIN_POINTS_PER_CELL:
                    values[c] = np.median(segment)
            known = ~np.isnan(values)
            if known.sum() < 2:
                continue
            centres_along = 0.5 * (knots[:-1] + knots[1:])
            filled = np.interp(centres_along, centres_along[known], values[known])
            # Knot values from the cell values: interior knots average the two
            # cells they divide, the ends take the cell beside them.
            at_knots = np.empty(count + 1)
            at_knots[0], at_knots[-1] = filled[0], filled[-1]
            if count > 1:
                at_knots[1:-1] = 0.5 * (filled[:-1] + filled[1:])
            lines[r] = at_knots

        current = RowGeometry(
            heading=geometry.heading, spacing=geometry.spacing, offset=geometry.offset,
            count=geometry.count, knots=knots, lines=lines, strength=geometry.strength,
        )
    return current
