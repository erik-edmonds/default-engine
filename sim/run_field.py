#!/usr/bin/env python3
"""One synthetic field, from a seed to a sensor file and its ground truth.

    conda run -n cornsim python sim/run_field.py --name smoke --seed 7 \\
        --rows 8 --plants 60 --spec A --out data/fields

Generates the field with CropCraft, proves the rebuilt plants match
CropCraft's own mesh, lays it on a terrain, flies the requested spec over it
with HELIOS++, and writes:

    <out>/<name>/cropcraft/       CropCraft's own output
    <out>/<name>/params.json      everything the field was drawn with
    <out>/<name>/plants.csv       one row per plant, with geometric height
    <out>/<name>/<spec>/sensor.laz   what a LiDAR would deliver
    <out>/<name>/<spec>/truth.npz    class, plant and row per PointId
    <out>/<name>/<spec>/summary.json counts and densities
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from dataclasses import asdict
from pathlib import Path

import numpy as np

import field as field_module
import generate
import meshes
import scene as scene_module
import survey
import truth as truth_module
from specs import SPECS
from terrain import sample_terrain


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", required=True)
    ap.add_argument("--seed", type=int, required=True)
    ap.add_argument("--rows", type=int, default=24)
    ap.add_argument("--plants", type=int, default=150, help="planting positions per row")
    ap.add_argument("--profile", default="standard", choices=("standard", "curved", "spacing"))
    ap.add_argument("--spec", default="A", choices=sorted(SPECS))
    ap.add_argument("--out", default="data/fields")
    ap.add_argument("--keep-scene", action="store_true", help="keep the HELIOS++ scene directory")
    args = ap.parse_args()

    spec = SPECS[args.spec]
    # Absolute: both Blender and HELIOS++ are started from other directories.
    root = (Path(args.out) / args.name).resolve()
    started = time.time()

    params = generate.sample_params(args.name, args.seed, args.rows, args.plants, args.profile)
    description, meshes_dir = generate.run_cropcraft(params, root / "cropcraft")

    library = field_module.ModelLibrary(generate.CROPCRAFT, "maize")
    _, plants = field_module.load_description(description, library)

    # THE GATE. Nothing below is worth running if the plants rebuilt from the
    # description are not the plants CropCraft actually made.
    rebuilt, _, _ = field_module.rebuild_crops(plants, library)
    exported, _ = meshes.read_obj(meshes_dir / "maize.obj")
    gate = meshes.validate_against_export(rebuilt, exported)
    print(f"  {len(plants):,} plants; rebuild matches CropCraft's mesh to {gate['worst_m'] * 1e6:.1f} um")

    # A different stream from the one that drew the field, so adding a terrain
    # parameter later cannot change which field a seed produces.
    terrain = sample_terrain(
        np.random.default_rng([args.seed, 1]),
        params.row_spacing,
        ridge_origin=params.row_spacing / 2.0,
        row_offset=params.row_offset,
    )
    scene_dir = root / "scene"
    scene = scene_module.build(scene_dir, meshes_dir, plants, library, terrain, params)

    lines = survey.plan_lines(scene.bounds, spec, params.flight_heading)
    survey_xml = survey.write_survey(scene_dir, f"spec_{spec.id}", spec, lines, scene.reference, scene.base_z)
    run_dir = survey.run(scene_dir, survey_xml, seed=args.seed)
    raw = survey.read_legs(run_dir, lines)

    points = truth_module.sensor_effects(raw, spec, scene, terrain, np.random.default_rng([args.seed, 2]))
    truth = truth_module.labels(points, plants)

    out = root / spec.id
    out.mkdir(parents=True, exist_ok=True)
    truth_module.write_sensor(out / "sensor.laz", points, spec)
    truth_module.write_truth(out / "truth.npz", truth)
    table = truth_module.plant_table(plants, library, terrain, params, truth)
    truth_module.write_table(root / "plants.csv", table)

    x_min, x_max, y_min, y_max = scene.bounds
    area = (x_max - x_min) * (y_max - y_min)
    classes, counts = np.unique(truth["truth_class"], return_counts=True)
    seen = sum(1 for row in table if row["returns"] > 0)
    summary = {
        "field": args.name,
        "seed": args.seed,
        "spec": asdict(spec),
        "flight_lines": len(lines),
        "points": int(len(points["x"])),
        "points_recorded_before_scan_angle_filter": int(len(raw["x"])),
        "density_per_m2": round(len(points["x"]) / area, 1),
        "area_m2": round(area, 1),
        "class_counts": {int(c): int(n) for c, n in zip(classes, counts)},
        "plants": len(plants),
        "plants_with_returns": seen,
        "returns_per_plant_median": float(np.median([row["returns"] for row in table])),
        "plant_height_mean_m": round(float(np.mean([row["height"] for row in table])), 4),
        "false_origin": truth_module.FALSE_ORIGIN,
        "rebuild_worst_um": round(gate["worst_m"] * 1e6, 2),
        "seconds": round(time.time() - started, 1),
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2))
    (root / "params.json").write_text(json.dumps(asdict(params), indent=2))

    # Thousands of small OBJ files that a seed regenerates in seconds.
    if not args.keep_scene:
        shutil.rmtree(scene_dir)

    print(json.dumps({k: v for k, v in summary.items() if k not in ("spec", "false_origin")}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
