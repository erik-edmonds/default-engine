"""Tests for the pipeline's arithmetic, which had none.

    python3 -m unittest discover -s pipeline -v
    yarn test:pipeline

WHY THIS FILE IS THE ONE WORTH HAVING. `thresholds.py` holds every unit
conversion in the project. A wrong threshold does not crash: it produces a
pipeline that runs happily and classifies a field against a bound that is off
by 3.28x, which looks exactly like a correct run. Phase 2 shipped with no test
of any of it, and the bugs §0 found by running the pipeline were all in the
layer above this one -- the arithmetic was never checked at all.

NO FRAMEWORK, DELIBERATELY. `unittest` is in the standard library and the
image already has Python; adding pytest would mean a dependency and a lock file
for assertions that `assertEqual` covers. This matches how the TypeScript side
is tested -- scripts/xr-measure-test.ts is a hand-rolled suite for the same
reason.
"""

from __future__ import annotations

import json
import unittest

import thresholds

# Metres per US survey foot and per international foot. The sample survey's SRS
# is a compound CRS that uses BOTH -- international horizontally (EPSG 9002),
# US survey vertically (EPSG 9003) -- which is why the two appear here together.
INTERNATIONAL_FOOT = 0.3048
US_SURVEY_FOOT = 0.304800609601219


class ToFileUnits(unittest.TestCase):
    def test_metric_file_is_identity(self):
        self.assertEqual(thresholds.to_file_units(5.0, 1.0), 5.0)

    def test_feet_divides_rather_than_multiplies(self):
        """The direction is the single easiest thing to get backwards here.

        `units_to_metres` is metres PER file unit, so going metres -> file
        units divides. Getting it backwards turns a 1 m threshold into 0.3 m
        instead of 3.28 ft -- a factor of 10.8 in the wrong direction, with
        both numbers looking plausible.
        """
        self.assertAlmostEqual(thresholds.to_file_units(1.0, INTERNATIONAL_FOOT), 3.2808398950131235)
        self.assertGreater(thresholds.to_file_units(1.0, INTERNATIONAL_FOOT), 1.0)

    def test_round_trips(self):
        for metres in (0.1, 0.5, 1.0, 5.0, 18.0, 120.0):
            for unit in (1.0, INTERNATIONAL_FOOT, US_SURVEY_FOOT):
                self.assertAlmostEqual(
                    thresholds.to_file_units(metres, unit) * unit, metres, places=9
                )

    def test_rejects_non_positive_units(self):
        """Zero would be a ZeroDivisionError and a negative would silently
        invert every threshold in the pipeline."""
        for bad in (0.0, -1.0, -0.3048):
            with self.assertRaises(ValueError):
                thresholds.to_file_units(1.0, bad)

    def test_the_two_feet_differ_but_not_enough_to_matter(self):
        """2 ppm. Written down so nobody 'fixes' it into a real error.

        Confusing the two at state-plane magnitudes -- coordinates around
        637,000 ft on the sample -- is a classic 1.3 m blunder. Applied to a
        height DIFFERENCE it is sub-millimetre, which is why a single scalar is
        used for both axes.
        """
        a = thresholds.to_file_units(58.24, INTERNATIONAL_FOOT)
        b = thresholds.to_file_units(58.24, US_SURVEY_FOOT)
        self.assertLess(abs(a - b) * INTERNATIONAL_FOOT, 0.001)


class EmittedThresholds(unittest.TestCase):
    """The numbers §0 actually measured in the emitted pipeline."""

    def test_below_ground_limit_in_feet(self):
        stage = thresholds.below_ground_stage(INTERNATIONAL_FOOT)
        self.assertEqual(stage["where"], "HeightAboveGround < -3.28084")

    def test_below_ground_limit_in_metres(self):
        stage = thresholds.below_ground_stage(1.0)
        self.assertEqual(stage["where"], "HeightAboveGround < -1.00000")

    def test_smrf_lengths_convert_and_scalars_do_not(self):
        feet = thresholds.smrf_stage(INTERNATIONAL_FOOT)
        metric = thresholds.smrf_stage(1.0)

        # Lengths convert.
        self.assertAlmostEqual(feet["cell"], 3.2808)
        self.assertAlmostEqual(metric["cell"], 1.0)
        self.assertAlmostEqual(metric["window"], 18.0)

        # WINDOW IS SET EXPLICITLY because PDAL's real default is `18 * cell`,
        # not the documented 18.0 -- so leaving it unset would make it track
        # cell silently and be 59 ft on a file in feet.
        self.assertAlmostEqual(feet["window"], 59.0551, places=3)

        # Slope is a rise over run and scalar is a multiplier: unitless, so
        # identical in both.
        self.assertEqual(feet["slope"], metric["slope"])
        self.assertEqual(feet["scalar"], metric["scalar"])

    def test_hag_extrapolation_is_explicitly_off(self):
        """Documented as defaulting to False and actually True in the source."""
        self.assertIs(thresholds.hag_stage(1.0)["allow_extrapolation"], False)

    def test_smrf_ignores_noise(self):
        """Required, not defensive: SMRF writes other_class to everything it
        decides is not ground, so without this it overwrites the noise
        classification filters.outlier just produced."""
        stage = thresholds.smrf_stage(1.0)
        self.assertEqual(stage["ignore"], f"Classification[{thresholds.NOISE_CLASS}:{thresholds.NOISE_CLASS}]")
        self.assertEqual(stage["returns"], ["last", "only"])


class Bands(unittest.TestCase):
    """The band edges, and their agreement with the viewer.

    src/config/asprs.ts reads the SAME src/config/hagBands.json and implements
    `bandForHeight` as `metres >= minM && (maxM === null || metres < maxM)`.
    These tests pin the Python side to those operators so the legend in the
    headset and the classification in the file cannot drift apart at a
    boundary.
    """

    def setUp(self):
        self.bands = thresholds.load_bands()

    def test_json_is_sorted_and_contiguous(self):
        edges = self.bands["bands"]
        for lower, upper in zip(edges, edges[1:]):
            self.assertEqual(
                lower["maxM"], upper["minM"], "a gap or overlap between bands leaves heights unclassified"
            )
        self.assertIsNone(edges[-1]["maxM"], "the top band must be open-ended")

    def test_emitted_operators_are_inclusive_lower_exclusive_upper(self):
        statements = thresholds.band_stage(1.0)["value"]
        self.assertEqual(len(statements), len(self.bands["bands"]))
        for statement in statements:
            self.assertIn("HeightAboveGround >= ", statement)
        # Every band but the open-ended top one carries an exclusive upper bound.
        bounded = [s for s in statements if "HeightAboveGround < " in s]
        self.assertEqual(len(bounded), len(self.bands["bands"]) - 1)

    def test_every_band_guards_ground_and_noise(self):
        """The statements are applied in order and later ones see earlier
        results, so each has to guard explicitly rather than rely on ordering."""
        for statement in thresholds.band_stage(1.0)["value"]:
            self.assertIn(f"Classification != {self.bands['groundClass']}", statement)
            self.assertIn(f"Classification != {thresholds.NOISE_CLASS}", statement)

    def test_edges_convert_with_the_file_unit(self):
        metric = thresholds.band_stage(1.0)["value"]
        feet = thresholds.band_stage(INTERNATIONAL_FOOT)["value"]
        self.assertIn("0.1000", metric[0])
        # 0.1 m is 0.328 ft.
        self.assertIn("0.3281", feet[0])


class TheCornCase(unittest.TestCase):
    """A PASSING TEST OF A KNOWN DEFECT, so it cannot be quietly forgotten.

    Field-measured maize, from KC & Khanal, *Precision Agriculture* 27:170
    (2026), the paper this phase is built on: 12-53 cm at V4-V5 (mean 38.27,
    sd 11.71) and 140-255 cm at VT (mean 218.43, sd 37.25).

    The bands in hagBands.json are generic ASPRS vegetation classes. Against a
    cornfield they collapse: the entire agronomically interesting spread at a
    given growth stage falls inside ONE class, so the classification carries no
    information about the crop. These tests assert that collapse. When the
    bands are replaced with canopy-relative quantiles they should start
    failing, and that is the signal to delete them.
    """

    @staticmethod
    def band_for_height(metres: float, bands: dict) -> int | None:
        """Mirror of `bandForHeight` in src/config/asprs.ts."""
        for band in bands["bands"]:
            if metres >= band["minM"] and (band["maxM"] is None or metres < band["maxM"]):
                return band["class"]
        return None

    def setUp(self):
        self.bands = thresholds.load_bands()

    def test_whole_mature_field_is_one_class(self):
        """1.40 m to 2.55 m -- a 1.15 m spread -- all the same class."""
        classes = {
            self.band_for_height(h, self.bands)
            for h in (1.40, 1.75, 2.18, 2.40, 2.55)
        }
        self.assertEqual(
            len(classes), 1, "if this fails the bands have been made crop-aware; delete this test"
        )
        self.assertEqual(classes, {4}, "medium vegetation")

    def test_stage_means_are_only_one_class_apart(self):
        v4 = self.band_for_height(0.3827, self.bands)
        vt = self.band_for_height(2.1843, self.bands)
        self.assertEqual(v4, 3)
        self.assertEqual(vt, 4)

    def test_nothing_in_a_cornfield_ever_reaches_the_top_band(self):
        """The 5 m edge is sized for trees. The tallest maize ever measured in
        the paper is 2.55 m, so class 5 is unreachable on a crop scan and the
        three-band ladder is really a two-band one."""
        tallest = 2.55
        self.assertNotEqual(self.band_for_height(tallest, self.bands), 5)
        self.assertLess(tallest, self.bands["heightRampMaxM"] / 2)


class BuildPipeline(unittest.TestCase):
    SOURCE = "s3://bucket/scan.copc.laz"
    DEST = "/scratch/scan.annotated.copc.laz"

    def setUp(self):
        self.pipeline = thresholds.build_pipeline(self.SOURCE, self.DEST, INTERNATIONAL_FOOT)
        self.types = [s["type"] for s in self.pipeline]

    def test_reads_and_writes_what_it_was_given(self):
        self.assertEqual(self.pipeline[0]["type"], "readers.copc")
        self.assertEqual(self.pipeline[0]["filename"], self.SOURCE)
        self.assertEqual(self.pipeline[-1]["type"], "writers.copc")
        self.assertEqual(self.pipeline[-1]["filename"], self.DEST)

    def test_height_is_written_as_float32(self):
        """`extra_dims: "all"` would write it as float64, and a scaled int16
        would be in centi-FEET on this file."""
        self.assertEqual(self.pipeline[-1]["extra_dims"], "HeightAboveGround=float32")

    def test_reset_precedes_the_ground_solve(self):
        """Order is load-bearing. The reset blanks the input's own
        classification; running it after SMRF would erase the ground solve."""
        assigns = [i for i, t in enumerate(self.types) if t == "filters.assign"]
        self.assertLess(assigns[0], self.types.index("filters.smrf"))

    def test_outlier_precedes_the_reset_which_preserves_its_noise(self):
        self.assertLess(self.types.index("filters.outlier"), self.types.index("filters.assign"))
        self.assertIn(f"Classification != {thresholds.NOISE_CLASS}", thresholds.reset_stage()["value"])

    def test_bands_come_after_the_height_they_read(self):
        assigns = [i for i, t in enumerate(self.types) if t == "filters.assign"]
        self.assertGreater(assigns[-1], self.types.index("filters.hag_nn"))

    def test_stats_come_after_the_classification_they_measure(self):
        """A stats stage placed before the band assignment would report the
        reset's uniform class 1 and the histogram would be a lie."""
        assigns = [i for i, t in enumerate(self.types) if t == "filters.assign"]
        stats = [i for i, t in enumerate(self.types) if t == "filters.stats"]
        self.assertEqual(len(stats), 2, "one overall, one below-ground")
        self.assertTrue(all(s > assigns[-1] for s in stats))
        self.assertTrue(all(s < self.types.index("writers.copc") for s in stats))

    def test_the_two_stats_stages_are_distinguishable_by_content(self):
        """PDAL keys metadata by stage TYPE and ignores `tag`, so both arrive
        as a list under one key. read_stats() in annotate.py tells them apart
        by content, which only works if their content actually differs."""
        stats = [s for s in self.pipeline if s["type"] == "filters.stats"]
        counted = [s for s in stats if "count" in s]
        filtered = [s for s in stats if "where" in s]
        self.assertEqual(len(counted), 1)
        self.assertEqual(len(filtered), 1)
        self.assertNotIn("count", filtered[0])

    def test_is_json_serialisable_with_no_comment_keys(self):
        """`comment` is not a documented PDAL option -- some versions ignore
        unknown keys and others reject them -- so the reasoning lives in the
        module and the emitted JSON stays strictly valid."""
        text = json.dumps({"pipeline": self.pipeline})
        self.assertNotIn('"comment"', text)
        self.assertEqual(json.loads(text)["pipeline"], self.pipeline)

    def test_no_threshold_is_left_unconverted(self):
        """A length that came out identical in feet and in metres was never
        converted. Compares the two pipelines field by field."""
        metric = thresholds.build_pipeline(self.SOURCE, self.DEST, 1.0)
        lengths = {"cell", "window", "threshold", "max_distance"}
        for feet_stage, metric_stage in zip(self.pipeline, metric):
            for key in lengths & feet_stage.keys():
                self.assertNotEqual(
                    feet_stage[key], metric_stage[key], f"{feet_stage['type']}.{key} did not convert"
                )


class Slg(unittest.TestCase):
    """The paper's percentile-grid method."""

    def test_grid_is_wider_than_the_row_spacing(self):
        """The whole reason the paper's grid is 1 m against 0.76 m rows. A cell
        narrower than the row spacing can sit entirely inside a canopy row and
        contain no bare ground to take a low percentile from."""
        self.assertGreater(thresholds.dtm_resolution_m(), thresholds.ROW_SPACING_M)

    def test_surface_resolution_converts(self):
        feet = thresholds.surface_stage("d.tif", 1, INTERNATIONAL_FOOT)
        metric = thresholds.surface_stage("d.tif", 1, 1.0)
        self.assertAlmostEqual(metric["resolution"], 0.988, places=3)
        self.assertAlmostEqual(feet["resolution"], 3.2415, places=3)

    def test_binmode_is_on_because_percentiles_require_it(self):
        """io/GDALWriter.cpp refuses: "Can't output percentiles without
        'binmode=true'". It is also the semantics the paper needs -- only
        points inside the cell, no distance-weighted smearing."""
        self.assertIs(thresholds.surface_stage("d.tif", 1, 1.0)["binmode"], True)

    def test_percentiles_are_the_paper_s(self):
        self.assertEqual(thresholds.GROUND_PERCENTILE, 1)
        self.assertEqual(thresholds.CANOPY_PERCENTILE, 99)
        self.assertEqual(thresholds.surface_stage("d.tif", 1, 1.0)["output_type"], ["p1"])
        self.assertEqual(thresholds.surface_stage("c.tif", 99, 1.0)["output_type"], ["p99"])

    def test_noise_is_excluded_from_both_surfaces(self):
        """One low noise return inside a cell would become that cell's 1st
        percentile and drag the ground surface, and every height above it,
        down with it."""
        for percentile in (1, 99):
            stage = thresholds.surface_stage("x.tif", percentile, 1.0)
            self.assertEqual(stage["where"], f"Classification != {thresholds.NOISE_CLASS}")

    def test_hag_dem_has_no_clamps(self):
        """DELIBERATELY UNCLAMPED. min_clamp/max_clamp exist, but annotate.py's
        guards detect a broken ground solve BY the implausible maximum and the
        below-ground tail. Clamping destroys that evidence and leaves a quietly
        wrong file that passes every check."""
        stage = thresholds.hag_dem_stage("dtm.tif")
        self.assertNotIn("min_clamp", stage)
        self.assertNotIn("max_clamp", stage)

    def test_hag_dem_does_not_zero_ground(self):
        """Nothing is classified as ground at that point in the pipeline -- the
        reset blanked it and SLG derives ground FROM the height. Left at its
        default of true the option would silently do nothing."""
        self.assertIs(thresholds.hag_dem_stage("dtm.tif")["zero_ground"], False)

    def test_ground_threshold_converts(self):
        """REGRESSION. The first draft formatted `nearGroundM` straight into
        the expression, which on a survey in feet made the ground threshold
        0.1 ft -- 3 cm -- instead of 0.1 m. HeightAboveGround is in the file's
        own unit like every other length."""
        metric = thresholds.ground_from_hag_stage(1.0)["value"]
        feet = thresholds.ground_from_hag_stage(INTERNATIONAL_FOOT)["value"]
        self.assertIn("0.1000", metric)
        self.assertIn("0.3281", feet)
        self.assertNotEqual(metric, feet)

    def test_ground_assign_preserves_noise(self):
        value = thresholds.ground_from_hag_stage(1.0)["value"]
        self.assertIn(f"Classification != {thresholds.NOISE_CLASS}", value)

    def test_pipeline_order_inverts_smrf_s(self):
        """The inversion IS the difference between the methods: SMRF solves
        ground then measures height from it, SLG measures height then derives
        ground from that."""
        slg = thresholds.build_pipeline("s", "d", 1.0, method="slg", dtm_path="dtm.tif")
        types = [s["type"] for s in slg]
        self.assertNotIn("filters.smrf", types)
        self.assertNotIn("filters.hag_nn", types)
        assigns = [i for i, t in enumerate(types) if t == "filters.assign"]
        # reset, nodata, ground-from-hag, bands
        self.assertEqual(len(assigns), 4)
        reset, nodata, ground, bands = assigns
        self.assertLess(reset, types.index("filters.hag_dem"))
        self.assertLess(types.index("filters.hag_dem"), nodata)
        self.assertLess(nodata, ground)
        self.assertLess(ground, bands)

    def test_nodata_is_marked_before_ground_is_derived(self):
        """THE ORDERING BUG THIS GUARDS. The nodata sentinel is a very negative
        height, so `HeightAboveGround < nearGround` is true for it. If ground
        were derived first, every point the DTM could not account for would be
        classified as ground -- the most misleading answer available, since the
        reason it has no height is that there was no ground under it."""
        slg = thresholds.build_pipeline("s", "d", 1.0, method="slg", dtm_path="dtm.tif")
        values = [s["value"] for s in slg if s["type"] == "filters.assign"]
        nodata_at = next(i for i, v in enumerate(values) if f"= {thresholds.NEVER_CLASSIFIED} " in str(v))
        ground_at = next(i for i, v in enumerate(values) if "nearGround" not in str(v) and "= 2 " in str(v))
        self.assertLess(nodata_at, ground_at)

    def test_ground_and_bands_both_exclude_never_classified(self):
        slg = thresholds.build_pipeline("s", "d", 1.0, method="slg", dtm_path="dtm.tif")
        guarded = 0
        for stage in slg:
            if stage["type"] != "filters.assign":
                continue
            text = stage["value"] if isinstance(stage["value"], str) else " ".join(stage["value"])
            if "HeightAboveGround >" in text or "nearGround" in text or "< 0.1000" in text:
                self.assertIn(f"Classification != {thresholds.NEVER_CLASSIFIED}", text)
                guarded += 1
        self.assertGreaterEqual(guarded, 2, "the ground assign and the band assigns")

    def test_nodata_sentinel_cannot_be_a_real_height(self):
        """In FILE UNITS, so it has to be absurd in feet as well as metres.
        -9999 ft is about -3 km."""
        self.assertLess(thresholds.NODATA_HAG, -1000)
        self.assertIs(thresholds.hag_dem_stage("d.tif")["nodata_hag"], thresholds.NODATA_HAG)

    def test_nodata_is_compared_loosely(self):
        """Against half the sentinel, not against the sentinel itself: exact
        float equality on a value that has been through a raster read and a
        subtraction is not something to rely on."""
        value = thresholds.nodata_stage()["value"]
        self.assertIn(f"{thresholds.NODATA_HAG / 2:.1f}", value)
        self.assertNotIn(f"{thresholds.NODATA_HAG:.1f}", value)

    def test_slg_needs_a_dtm(self):
        with self.assertRaises(ValueError):
            thresholds.build_pipeline("s", "d", 1.0, method="slg")

    def test_unknown_method_is_refused(self):
        for bad in ("pmf", "csf", "", "SLG"):
            with self.assertRaises(ValueError):
                thresholds.build_pipeline("s", "d", 1.0, method=bad)

    def test_surface_pipeline_writes_both_rasters_from_one_stream(self):
        """Both surfaces come from the same filtered stream, so they are
        guaranteed to be on the same grid and to have seen the same points --
        which is what makes CSM minus DTM a crop height rather than two
        unrelated interpolations subtracted."""
        pipeline = thresholds.build_surface_pipeline("s", "d.tif", "c.tif", 1.0)
        writers = [s for s in pipeline if s["type"] == "writers.gdal"]
        self.assertEqual(len(writers), 2)
        self.assertEqual(writers[0]["resolution"], writers[1]["resolution"])
        self.assertEqual(writers[0]["filename"], "d.tif")
        self.assertEqual(writers[1]["filename"], "c.tif")

    def test_no_slg_threshold_is_left_unconverted(self):
        """The same sweep BuildPipeline does, over the SLG pipelines -- which
        is what would have caught the ground-threshold bug above."""
        feet = thresholds.build_pipeline("s", "d", INTERNATIONAL_FOOT, method="slg", dtm_path="x.tif")
        metric = thresholds.build_pipeline("s", "d", 1.0, method="slg", dtm_path="x.tif")
        # Only the assigns that actually carry a length. The reset stage is
        # pure class codes -- `Classification = 1 WHERE Classification != 7` --
        # and correctly reads the same in every unit system.
        converted = 0
        for a, b in zip(feet, metric):
            if a["type"] != "filters.assign":
                continue
            text = a["value"] if isinstance(a["value"], str) else " ".join(a["value"])
            if "HeightAboveGround" not in text:
                continue
            # THE NODATA SENTINEL IS NOT A LENGTH and must NOT convert. It is a
            # marker chosen to be impossible in any unit, so scaling it by
            # 3.28 would be meaningless -- and would move the comparison
            # threshold relative to the value hag_dem actually writes, which
            # is the one place a conversion here would do harm.
            if str(thresholds.NODATA_HAG / 2) in text or "-4999" in text:
                self.assertEqual(a["value"], b["value"], "the sentinel must be unit-free")
                continue
            self.assertNotEqual(a["value"], b["value"], "an assign threshold did not convert")
            converted += 1
        self.assertEqual(converted, 2, "expected the ground threshold and the band edges")

        surf_feet = thresholds.build_surface_pipeline("s", "d.tif", "c.tif", INTERNATIONAL_FOOT)
        surf_metric = thresholds.build_surface_pipeline("s", "d.tif", "c.tif", 1.0)
        for a, b in zip(surf_feet, surf_metric):
            if a["type"] == "writers.gdal":
                self.assertNotEqual(a["resolution"], b["resolution"])


class VersionFloor(unittest.TestCase):
    def test_required_pdal_is_at_least_the_extra_dims_floor(self):
        """`extra_dims` on writers.copc did not exist before 2.7.0. On an older
        build the option is ignored, the height dimension is silently not
        written, and the pipeline still reports success."""
        self.assertGreaterEqual(thresholds.REQUIRED_PDAL, (2, 7, 0))

    def test_slg_floor_is_higher_than_smrf_s(self):
        """`writers.gdal` percentiles merged 2025-11-19 (PR #4839), after the
        2.9.2 release -- and the pdal/pdal:2.9.2 IMAGE contains 2.8.4, so the
        amd64 versioned image cannot compute a percentile raster at all."""
        self.assertGreaterEqual(thresholds.required_pdal("slg"), (2, 10, 0))
        self.assertGreater(thresholds.required_pdal("slg"), thresholds.required_pdal("smrf"))
        self.assertEqual(thresholds.required_pdal("smrf"), thresholds.REQUIRED_PDAL)


if __name__ == "__main__":
    unittest.main(verbosity=2)
