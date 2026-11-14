"""Tests for the mesh and ground-truth layer.

    conda run -n cornsim python -m unittest discover -s sim -t sim -v
    yarn test:sim

These need numpy and scipy, so they run in the `cornsim` environment rather
than under the system Python the stdlib-only pipeline tests use.
"""

from __future__ import annotations

import json
import math
import tempfile
import unittest
from pathlib import Path

import numpy as np

import field
import meshes

# The maize assets as CropCraft 78f2205 ships them, in description.yaml order.
MAIZE = {
    "maize_small.obj": 0.21,
    "maize_medium.obj": 0.35,
    "maize_big_1.obj": 0.49,
    "maize_big_2.obj": 0.40,
    "maize_big_3.obj": 0.45,
}


class Euler(unittest.TestCase):
    def test_yaw_turns_x_into_y(self):
        r = meshes.euler_xyz(0, 0, math.pi / 2)
        np.testing.assert_allclose(r @ [1, 0, 0], [0, 1, 0], atol=1e-12)

    def test_is_a_rotation(self):
        r = meshes.euler_xyz(0.3, -0.2, 1.1)
        np.testing.assert_allclose(r @ r.T, np.eye(3), atol=1e-12)
        self.assertAlmostEqual(np.linalg.det(r), 1.0)

    def test_order_is_x_then_y_then_z_about_fixed_axes(self):
        """Blender's XYZ Euler. The order was confirmed against CropCraft's own
        exported mesh to about a micrometre; this pins it so a tidy-up cannot
        quietly swap it. The two orders differ by well under a centimetre on a
        real plant, which is exactly why it has to be pinned."""
        roll, pitch, yaw = 0.4, 0.3, 0.9
        rx = meshes.euler_xyz(roll, 0, 0)
        ry = meshes.euler_xyz(0, pitch, 0)
        rz = meshes.euler_xyz(0, 0, yaw)
        np.testing.assert_allclose(meshes.euler_xyz(roll, pitch, yaw), rz @ ry @ rx, atol=1e-12)
        self.assertFalse(np.allclose(meshes.euler_xyz(roll, pitch, yaw), rx @ ry @ rz, atol=1e-6))

    def test_place_scales_before_it_rotates_and_translates_last(self):
        v = np.array([[1.0, 0.0, 0.0]])
        out = meshes.place(v, 2.0, meshes.euler_xyz(0, 0, math.pi / 2), np.array([10.0, 0.0, 5.0]))
        np.testing.assert_allclose(out, [[10.0, 2.0, 5.0]], atol=1e-12)


class ObjFiles(unittest.TestCase):
    def test_polygons_are_fan_triangulated(self):
        """CropCraft's meshes are mostly quads and n-gons; a ray caster wants
        triangles."""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "quad.obj"
            path.write_text("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0.5 2 0\nf 1 2 3 4 5\n")
            v, f = meshes.read_obj(path)
        self.assertEqual(len(v), 5)
        np.testing.assert_array_equal(f, [[0, 1, 2], [0, 2, 3], [0, 3, 4]])

    def test_reads_slashed_and_relative_indices(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "t.obj"
            path.write_text("v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvn 0 0 1\nf 1/1/1 2/1/1 3/1/1\nf -3 -2 -1\n")
            _, f = meshes.read_obj(path)
        np.testing.assert_array_equal(f, [[0, 1, 2], [0, 1, 2]])

    def test_round_trip(self):
        v = np.array([[0.0, 0.0, 0.0], [1.5, 0.0, 0.25], [0.0, 2.0, -0.125]])
        f = np.array([[0, 1, 2]], dtype=np.int32)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "r.obj"
            meshes.write_obj(path, v, f, mtllib="m.mtl", material="crop")
            text = path.read_text()
            v2, f2 = meshes.read_obj(path)
        self.assertIn("mtllib m.mtl", text)
        self.assertIn("usemtl crop", text)
        np.testing.assert_allclose(v2, v, atol=1e-6)
        np.testing.assert_array_equal(f2, f)


class ModelOrder(unittest.TestCase):
    """The upstream bug `validate_against_export` found, pinned.

    CropCraft records the model by Python list order; Blender instances the
    collection's children sorted by object name. See the note in field.py.
    """

    def test_candidates_keep_the_yaml_order_and_the_inclusive_bounds(self):
        got = field.candidate_models(MAIZE, 0.40, 0.25)  # 0.30 .. 0.50
        self.assertEqual(got, ["maize_medium.obj", "maize_big_1.obj", "maize_big_2.obj", "maize_big_3.obj"])
        # Both ends inclusive, as in PlantManager.get_model_list_by_height.
        self.assertEqual(field.candidate_models({"a.obj": 0.5, "b.obj": 1.5}, 1.0, 0.5), ["a.obj", "b.obj"])

    def test_blender_hands_them_out_sorted_by_stem(self):
        got = field.instanced_order(["maize_medium.obj", "maize_big_1.obj", "maize_big_2.obj", "maize_big_3.obj"])
        self.assertEqual(got, ["maize_big_1.obj", "maize_big_2.obj", "maize_big_3.obj", "maize_medium.obj"])

    def test_the_first_field_generated_had_every_plant_mislabelled(self):
        """With a 0.40 m target and 25% tolerance the two orders are a full
        rotation of each other, so no recorded filename is the mesh in the
        scene. This is the case that produced a 9 cm mean height error in the
        'truth'."""
        recorded = field.candidate_models(MAIZE, 0.40, 0.25)
        actual = field.instanced_order(recorded)
        self.assertTrue(all(r != a for r, a in zip(recorded, actual)))

    def test_a_bed_of_only_big_models_is_unaffected(self):
        """Why the bug is easy to miss: when the tolerance admits only models
        that already sort in yaml order, the description happens to be right."""
        recorded = field.candidate_models(MAIZE, 0.47, 0.06)
        self.assertEqual(recorded, ["maize_big_1.obj", "maize_big_3.obj"])
        self.assertEqual(field.instanced_order(recorded), recorded)

    def test_sorting_is_by_stem_not_by_filename(self):
        """They differ when one stem is a prefix of another. As FILENAMES,
        'a-b.obj' sorts before 'a.obj' because '-' (0x2d) precedes '.' (0x2e);
        as STEMS, 'a' sorts before 'a-b'. Blender sorts object names, and
        CropCraft names each object after its stem."""
        self.assertEqual(field.instanced_order(["a.obj", "a-b.obj"]), ["a.obj", "a-b.obj"])
        self.assertEqual(sorted(["a.obj", "a-b.obj"]), ["a-b.obj", "a.obj"])


class Validation(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(7)
        self.points = rng.uniform(0, 10, size=(500, 3))

    def test_passes_whatever_the_vertex_order(self):
        shuffled = self.points[np.random.default_rng(1).permutation(len(self.points))]
        stats = meshes.validate_against_export(self.points, shuffled)
        self.assertLess(stats["worst_m"], 1e-9)

    def test_refuses_a_different_vertex_count(self):
        with self.assertRaises(AssertionError):
            meshes.validate_against_export(self.points[:-1], self.points)

    def test_refuses_a_two_millimetre_shift(self):
        with self.assertRaises(AssertionError):
            meshes.validate_against_export(self.points + [0.002, 0, 0], self.points)

    def test_checks_both_directions(self):
        """One direction alone would pass a rebuild whose every vertex sits on
        an exported vertex but which leaves some exported vertices uncovered."""
        collapsed = self.points.copy()
        collapsed[1] = collapsed[0]
        with self.assertRaises(AssertionError):
            meshes.validate_against_export(collapsed, self.points)


class _Library:
    """Stands in for ModelLibrary without touching the CropCraft checkout."""

    heights = MAIZE


class LoadDescription(unittest.TestCase):
    def _write(self, tmp: str, crops_per_row: list[list[dict]], beds_count: int = 1) -> Path:
        def crop(x, y, filename, height):
            return {"x": x, "y": y, "z": 0.0, "roll": 0.0, "pitch": 0.0, "yaw": 0.0,
                    "height": height, "width": 0.3, "leaf_area": 0.1, "type": "maize", "filename": filename}

        bed_state = {"rows": [{"crops": [crop(**c) for c in row]} for row in crops_per_row]}
        data = {
            "config": {"beds": [{"name": "maize", "plant_type": "maize", "plant_height": 0.40,
                                 "height_tolerance_coeff": 0.25, "beds_count": beds_count}]},
            "field": {"beds": [bed_state] * beds_count},
        }
        path = Path(tmp) / "description.json"
        path.write_text(json.dumps(data))
        return path

    def test_ids_start_at_one_and_rows_run_across_beds(self):
        rows = [[{"x": 0, "y": 0, "filename": "maize_big_2.obj", "height": 0.40}],
                [{"x": 0, "y": 0.76, "filename": "maize_big_2.obj", "height": 0.40}]]
        with tempfile.TemporaryDirectory() as tmp:
            _, plants = field.load_description(self._write(tmp, rows, beds_count=2), _Library())
        self.assertEqual([p.id for p in plants], [1, 2, 3, 4])
        self.assertEqual([p.row for p in plants], [0, 1, 2, 3])

    def test_scale_comes_from_the_recorded_model_and_applies_to_the_actual_one(self):
        """Recorded as maize_big_2 (0.40 m) at height 0.48 -> scale 1.2. The
        mesh actually instanced is maize_big_3 (0.45 m), so the plant in the
        scene is nominally 0.54 m, not the 0.48 m the file claims."""
        rows = [[{"x": 0, "y": 0, "filename": "maize_big_2.obj", "height": 0.48}]]
        with tempfile.TemporaryDirectory() as tmp:
            _, plants = field.load_description(self._write(tmp, rows), _Library())
        p = plants[0]
        self.assertAlmostEqual(p.scale, 1.2)
        self.assertEqual(p.model, "maize_big_3.obj")
        self.assertEqual(p.recorded_model, "maize_big_2.obj")
        self.assertAlmostEqual(p.height, 0.54)
        self.assertAlmostEqual(p.recorded_height, 0.48)

    def test_refuses_a_bed_count_the_configuration_does_not_explain(self):
        rows = [[{"x": 0, "y": 0, "filename": "maize_big_2.obj", "height": 0.40}]]
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write(tmp, rows)
            data = json.loads(path.read_text())
            data["field"]["beds"].append(data["field"]["beds"][0])
            path.write_text(json.dumps(data))
            with self.assertRaises(ValueError):
                field.load_description(path, _Library())


if __name__ == "__main__":
    unittest.main(verbosity=2)
