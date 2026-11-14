"""Tests for row detection, on fields whose geometry is known by construction.

    conda run -n cornsim python -m unittest discover -s pipeline -t pipeline
    yarn test:sim

These need numpy, so they live with the cornsim suite rather than with the
stdlib-only threshold tests.
"""

from __future__ import annotations

import math
import unittest

import numpy as np

import rows


def _heading_error(geometry: rows.RowGeometry, true_deg: float) -> float:
    """Degrees between two headings, modulo 180 -- rows have no direction."""
    got = math.degrees(geometry.heading) % 180
    delta = abs(got - true_deg % 180)
    return min(delta, 180 - delta)


ROW_SPACING = 0.76
PLANT_SPACING = 0.16


def synthetic_field(
    heading_deg: float = 0.0,
    spacing: float = ROW_SPACING,
    row_count: int = 12,
    length: float = 20.0,
    weed_fraction: float = 0.15,
    curve_amplitude: float = 0.0,
    curve_wavelength: float = 20.0,
    missing: float = 0.1,
    seed: int = 0,
    plant_height: float = 0.4,
    returns_per_plant: int = 40,
    ground_points: int = 40_000,
    offset: float = 0.0,
):
    """A cloud with the row structure a real one would have, and nothing else.

    Returns x, y, hag and the true cross-row position of each row, so a solve
    can be scored rather than eyeballed. Crop points are scattered around each
    plant with the spread a 40 cm maize plant has; weeds are uniform, which is
    the property that makes them weeds here.
    """
    rng = np.random.default_rng(seed)
    theta = math.radians(heading_deg)
    along_axis = np.array([math.cos(theta), math.sin(theta)])
    across_axis = np.array([-math.sin(theta), math.cos(theta)])

    centres = offset + spacing * np.arange(row_count)
    xs, ys, hs = [], [], []

    for centre in centres:
        slots = np.arange(0, int(length / PLANT_SPACING))
        present = rng.random(len(slots)) > missing
        for a in slots[present] * PLANT_SPACING:
            bend = curve_amplitude * math.sin(2 * math.pi * a / curve_wavelength)
            # A maize plant: leaves reach out about 15 cm, height varies.
            n = returns_per_plant
            da = rng.normal(0, 0.06, n)
            dc = rng.normal(0, 0.07, n)
            h = rng.uniform(0.1, 1.0, n) ** 0.6 * plant_height
            point = along_axis * (a + da)[:, None] + across_axis * (centre + bend + dc)[:, None]
            xs.append(point[:, 0]); ys.append(point[:, 1]); hs.append(h)

    # Weeds, uniform over the field: the population row detection must not be
    # pulled towards.
    width = spacing * row_count
    weed_count = int(weed_fraction * sum(len(h) for h in hs))
    wa = rng.uniform(0, length, weed_count)
    wc = rng.uniform(-spacing / 2, width, weed_count)
    point = along_axis * wa[:, None] + across_axis * wc[:, None]
    xs.append(point[:, 0]); ys.append(point[:, 1]); hs.append(rng.uniform(0.01, 0.08, weed_count))

    # Ground, everywhere, below the vegetation threshold.
    ga = rng.uniform(0, length, ground_points)
    gc = rng.uniform(-spacing / 2, width, ground_points)
    point = along_axis * ga[:, None] + across_axis * gc[:, None]
    xs.append(point[:, 0]); ys.append(point[:, 1]); hs.append(rng.normal(0, 0.012, ground_points))

    return np.concatenate(xs), np.concatenate(ys), np.concatenate(hs), centres


class Solve(unittest.TestCase):
    def test_straight_rows_along_x(self):
        x, y, hag, centres = synthetic_field(heading_deg=0.0)
        g = rows.solve(x, y, hag)
        # Modulo 180, so 179.9 and 0.1 are a fifth of a degree apart. The
        # first version of this compared them as plain numbers and failed a
        # correct answer by 179.4 degrees.
        self.assertLess(_heading_error(g, 0.0), 0.2)
        self.assertAlmostEqual(g.spacing, ROW_SPACING, delta=0.01)
        self.assertGreater(g.strength, rows.MIN_ROW_STRENGTH)

    def test_recovers_an_arbitrary_heading(self):
        for heading in (0.0, 17.0, 45.0, 73.0, 90.0, 123.0):
            x, y, hag, _ = synthetic_field(heading_deg=heading, seed=1)
            g = rows.solve(x, y, hag)
            self.assertLess(_heading_error(g, heading), 0.2, f"heading {heading}")
            self.assertAlmostEqual(g.spacing, ROW_SPACING, delta=0.01)

    def test_recovers_a_non_standard_spacing(self):
        """The out-of-distribution test fields use 0.70 m, and nothing about
        the solve may assume 0.76."""
        for spacing in (0.50, 0.70, 0.76, 0.95):
            x, y, hag, _ = synthetic_field(spacing=spacing, seed=2)
            g = rows.solve(x, y, hag)
            # The period scan steps by 0.5 cm, so that is the floor on how
            # well any spacing can be recovered.
            self.assertAlmostEqual(g.spacing, spacing, delta=rows.PERIOD_STEP_M, msg=f"true {spacing}")

    def test_rows_are_found_where_they_are(self):
        x, y, hag, centres = synthetic_field(heading_deg=31.0, seed=3)
        g = rows.solve(x, y, hag)
        # Every true row centre should be close to SOME solved row centre.
        solved = g.offset + g.spacing * np.arange(g.count)
        for centre in centres:
            self.assertLess(np.abs(solved - centre).min(), 0.02, f"row at {centre:.2f} unmatched")

    def test_survives_heavy_weed_pressure(self):
        x, y, hag, _ = synthetic_field(weed_fraction=0.6, seed=4)
        g = rows.solve(x, y, hag)
        self.assertAlmostEqual(g.spacing, ROW_SPACING, delta=rows.PERIOD_STEP_M)
        self.assertLess(_heading_error(g, 0.0), 0.2)

    def test_refuses_bare_soil(self):
        rng = np.random.default_rng(5)
        n = 5000
        with self.assertRaises(RuntimeError):
            rows.solve(rng.uniform(0, 20, n), rng.uniform(0, 9, n), rng.normal(0, 0.01, n))

    def test_refuses_vegetation_with_no_row_structure(self):
        """Scattered vegetation with no periodicity must not yield a confident
        answer. Checked through `strength`, which is what a caller gates on."""
        rng = np.random.default_rng(6)
        n = 20_000
        g = rows.solve(rng.uniform(0, 20, n), rng.uniform(0, 9, n), rng.uniform(0.1, 0.5, n))
        # 2 n R^2 averages about 1 with no structure; a real field returns
        # tens of thousands. The gap is four orders of magnitude, so the
        # threshold is a significance level rather than a tuned number.
        self.assertLess(g.strength, rows.MIN_ROW_STRENGTH)


class Assignment(unittest.TestCase):
    def test_offset_is_zero_on_a_row_and_half_a_spacing_between(self):
        g = rows.RowGeometry(heading=0.0, spacing=0.76, offset=0.38, count=5)
        _, offset, _ = g.assign([0.0, 0.0, 0.0], [0.38, 0.38 + 0.38, 0.38 + 0.76])
        np.testing.assert_allclose(offset, [0.0, 0.38, 0.0], atol=1e-9)

    def test_offset_never_exceeds_half_a_spacing(self):
        g = rows.RowGeometry(heading=0.0, spacing=0.76, offset=0.38, count=12)
        y = np.random.default_rng(0).uniform(0.38, 0.38 + 11 * 0.76, 2000)
        _, offset, _ = g.assign(np.zeros_like(y), y)
        self.assertLessEqual(np.abs(offset).max(), 0.76 / 2 + 1e-9)

    def test_row_index_is_clamped_to_the_field(self):
        g = rows.RowGeometry(heading=0.0, spacing=0.76, offset=0.0, count=4)
        row, _, _ = g.assign([0, 0, 0], [-5.0, 0.0, 50.0])
        self.assertEqual(row.tolist(), [0, 0, 3])

    def test_along_and_across_are_a_rotation(self):
        g = rows.RowGeometry(heading=math.radians(37.0), spacing=0.76, offset=0.0, count=4)
        rng = np.random.default_rng(1)
        x, y = rng.uniform(-50, 50, 500), rng.uniform(-50, 50, 500)
        along, across = g.project(x, y)
        np.testing.assert_allclose(along**2 + across**2, x**2 + y**2, rtol=1e-9)


class CentreLines(unittest.TestCase):
    """Tracing where each row actually runs.

    The floor on any of these is the plant's own leaf spread: returns are
    scattered about 7 cm either side of a stem, so even a perfect centre line
    leaves a p90 offset near 11 cm.
    """

    CURVE_AMPLITUDE = 0.25
    CURVE_WAVELENGTH = 18.0

    def _offsets(self, geometry, x, y, hag):
        veg = hag >= rows.MIN_VEGETATION_M
        crop = hag[veg] >= 0.12
        _, offset, _ = geometry.assign(x[veg], y[veg])
        return np.percentile(np.abs(offset[crop]), 90)

    def test_a_curved_field_is_followed(self):
        """A bend of 25 cm is a third of a row spacing. Two full periods of it
        are also what a per-row QUADRATIC could not represent -- it made the
        offsets worse than assuming the rows were straight, which is why the
        centre lines are knotted."""
        x, y, hag, _ = synthetic_field(
            curve_amplitude=self.CURVE_AMPLITUDE, curve_wavelength=self.CURVE_WAVELENGTH,
            length=36.0, seed=7,
        )
        straight = rows.solve(x, y, hag)
        fitted = rows.fit_centrelines(straight, x, y, hag)
        before = self._offsets(straight, x, y, hag)
        after = self._offsets(fitted, x, y, hag)
        self.assertLess(after, before * 0.7, f"p90 offset {before:.3f} -> {after:.3f} m")
        self.assertTrue(fitted.fitted)

    def test_a_straight_field_is_left_alone(self):
        x, y, hag, _ = synthetic_field(curve_amplitude=0.0, seed=8)
        straight = rows.solve(x, y, hag)
        fitted = rows.fit_centrelines(straight, x, y, hag)
        before = self._offsets(straight, x, y, hag)
        after = self._offsets(fitted, x, y, hag)
        self.assertLess(abs(after - before), 0.01, "a straight field should not be bent")
        # And the traced departures should be near zero everywhere.
        self.assertLess(np.abs(fitted.lines).max(), 0.06)

    def test_tracing_is_not_pulled_by_weeds(self):
        """Weeds outnumbering the crop four to one. The centre is a median of
        the points within a third of a spacing, so they do not move it."""
        for amplitude in (0.0, 0.25):
            x, y, hag, _ = synthetic_field(
                curve_amplitude=amplitude, curve_wavelength=self.CURVE_WAVELENGTH,
                length=36.0 if amplitude else 20.0, weed_fraction=0.8, seed=9,
            )
            clean_x, clean_y, clean_hag, _ = synthetic_field(
                curve_amplitude=amplitude, curve_wavelength=self.CURVE_WAVELENGTH,
                length=36.0 if amplitude else 20.0, weed_fraction=0.0, seed=9,
            )
            weedy = rows.fit_centrelines(rows.solve(x, y, hag), x, y, hag)
            clean = rows.fit_centrelines(
                rows.solve(clean_x, clean_y, clean_hag), clean_x, clean_y, clean_hag
            )
            self.assertEqual(weedy.lines.shape, clean.lines.shape)
            self.assertLess(
                np.abs(weedy.lines - clean.lines).max(), 0.05,
                f"weeds moved the centre lines (amplitude {amplitude})",
            )

    def test_knots_span_the_field(self):
        x, y, hag, _ = synthetic_field(length=20.0, seed=10)
        fitted = rows.fit_centrelines(rows.solve(x, y, hag), x, y, hag)
        along, _ = fitted.project(x, y)
        self.assertLessEqual(fitted.knots[0], along.min() + 1e-6)
        self.assertGreaterEqual(fitted.knots[-1], along.max() - 1e-6)
        self.assertAlmostEqual(
            float(np.diff(fitted.knots).max()), rows.KNOT_SPACING_M, delta=rows.KNOT_SPACING_M
        )

    def test_assignment_survives_a_departure_past_half_a_spacing(self):
        """The reason assign() revises its first guess: on a curved field the
        departure routinely exceeds half a spacing, and an unrevised guess
        picks the neighbouring row there."""
        knots = np.array([0.0, 10.0, 20.0])
        # Row 1 wanders two thirds of a spacing away and back. NOT a whole
        # spacing: that would put it exactly on row 2's centre, and the answer
        # would be genuinely ambiguous rather than merely hard -- which is
        # what the first version of this test asserted, wrongly.
        wander = 0.76 * 2 / 3
        lines = np.zeros((3, 3))
        lines[1] = [0.0, wander, 0.0]
        g = rows.RowGeometry(
            heading=0.0, spacing=0.76, offset=0.0, count=3, knots=knots, lines=lines
        )
        # A point exactly on row 1's traced centre at along = 10. Rounding the
        # straight way round would call it row 2.
        row, offset, _ = g.assign([10.0], [0.76 + wander])
        self.assertEqual(int(row[0]), 1)
        self.assertAlmostEqual(float(offset[0]), 0.0, places=6)

    def test_all_rows_shifting_together_is_not_a_row_change(self):
        """A field following a contour shifts bodily. Every row moving by two
        thirds of a spacing must not renumber the whole field."""
        knots = np.array([0.0, 10.0, 20.0])
        shift = 0.76 * 2 / 3
        lines = np.tile([0.0, shift, 0.0], (4, 1))
        g = rows.RowGeometry(
            heading=0.0, spacing=0.76, offset=0.0, count=4, knots=knots, lines=lines
        )
        for r in range(4):
            row, offset, _ = g.assign([10.0], [0.76 * r + shift])
            self.assertEqual(int(row[0]), r)
            self.assertAlmostEqual(float(offset[0]), 0.0, places=6)


if __name__ == "__main__":
    unittest.main(verbosity=2)
