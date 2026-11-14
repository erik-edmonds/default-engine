"""From simulator output to two files: what a sensor saw, and what was true.

THE SEPARATION IS THE POINT OF THIS MODULE. HELIOS++ returns every point with
the object it hit attached. Written straight to disk, that would hand the
pipeline a file in which the answer sits in a column beside the question, and
the first careless `features = everything except xyz` would train a classifier
on its own labels and report a perfect score.

So two files are written and they share nothing but an id:

  sensor.laz   what a real LiDAR records -- position, intensity, return
               numbers, time, scan angle, flight line -- plus a `PointId`.
               Classification is 0 throughout. This is the pipeline's input.
  truth.npz    class, plant and row for every PointId. Read only by scoring.

`PointId` exists because PDAL reorders points when it builds a COPC octree, so
position in the file cannot be the join key.
"""

from __future__ import annotations

import csv
from pathlib import Path

import laspy
import numpy as np

import field as field_module
import scene as scene_module
from generate import FieldParams
from specs import FlightSpec
from terrain import Terrain

# The classes the corn pipeline predicts, carried as ASPRS codes because that
# is what LAS holds natively and what every other tool will read.
SOIL, WEED, CROP, NOISE = 2, 4, 5, 7

# Part id given to stray returns injected below. They hit nothing in the scene.
NOISE_ID = 999_999

# A false origin, so coordinates have the magnitude real projected coordinates
# have. A pipeline developed on a cloud centred at zero has never met the
# float32 precision problem every real survey has -- 6 cm of resolution at
# 600 km -- and would meet it for the first time on a customer's file. These
# are UTM-like numbers and nothing more; the field is not anywhere.
FALSE_ORIGIN = (300_000.0, 4_400_000.0, 300.0)

# Fraction of returns added as strays, and how far from the surface they sit.
STRAY_RATE = 0.0005


def sensor_effects(
    points: dict[str, np.ndarray],
    spec: FlightSpec,
    scene: scene_module.Scene,
    terrain: Terrain,
    rng: np.random.Generator,
) -> dict[str, np.ndarray]:
    """What happens between an ideal scan and a delivered file.

    Three things, each of which a real acquisition does and a naive simulation
    omits:

      1. Returns beyond the usable scan angle are dropped. A spinning head
         records all the way round; nobody delivers the grazing returns.
      2. Each flight line is displaced as a rigid whole by a few centimetres.
         Direct georeferencing leaves strips mutually misregistered, and on a
         plant a few centimetres across that smears it over as many copies as
         there are overlapping strips. It is the main reason a real crop cloud
         is blurrier than its range noise alone predicts.
      3. A few stray returns are added above and below the surface -- birds,
         dust, multipath -- so that a noise filter has something to find and
         its false-positive rate on real plant tops can be measured.
    """
    keep = np.abs(points["scan_angle"]) <= spec.usable_half_angle_deg
    out = {name: values[keep] for name, values in points.items()}

    lines = int(out["line"].max()) + 1
    shift = rng.normal(0.0, spec.strip_sigma_m, size=(lines, 3))
    for axis, name in enumerate(("x", "y", "z")):
        out[name] = out[name] + shift[out["line"], axis]

    count = int(round(STRAY_RATE * len(out["x"])))
    if count:
        x_min, x_max, y_min, y_max = scene.bounds
        sx = rng.uniform(x_min, x_max, count)
        sy = rng.uniform(y_min, y_max, count)
        above = rng.random(count) < 0.7
        offset = np.where(above, rng.uniform(0.6, 12.0, count), -rng.uniform(0.4, 4.0, count))
        stray = {
            "x": sx,
            "y": sy,
            "z": terrain.height(sx, sy) + offset,
            "intensity": rng.uniform(0.0, np.percentile(out["intensity"], 20), count),
            "echo_width": np.zeros(count),
            "return_number": np.ones(count),
            "number_of_returns": np.ones(count),
            "fullwave_index": np.full(count, -1.0),
            "object_id": np.full(count, float(NOISE_ID)),
            "helios_class": np.full(count, float(NOISE)),
            "gps_time": rng.uniform(out["gps_time"].min(), out["gps_time"].max(), count),
            "line": rng.integers(0, lines, count).astype(out["line"].dtype),
            "scan_angle": rng.uniform(-spec.usable_half_angle_deg, spec.usable_half_angle_deg, count),
        }
        out = {name: np.concatenate([out[name], stray[name]]) for name in out}

    # Time order, as a sensor delivers it. It also scatters the strays through
    # the file instead of leaving them as a labelled block at the end.
    order = np.argsort(out["gps_time"], kind="stable")
    return {name: values[order] for name, values in out.items()}


def labels(points: dict[str, np.ndarray], plants: list[field_module.Plant]) -> dict[str, np.ndarray]:
    """Class, plant and row for every return, from the part it hit."""
    part = points["object_id"].astype(np.int64)
    count = len(plants)

    truth_class = np.full(len(part), SOIL, dtype=np.uint8)
    weed_ids = np.array(sorted(scene_module.WEED_ID.values()))
    is_crop = (part >= 1) & (part <= count)
    truth_class[np.isin(part, weed_ids)] = WEED
    truth_class[is_crop] = CROP
    truth_class[part == NOISE_ID] = NOISE

    known = is_crop | np.isin(part, weed_ids) | np.isin(part, [scene_module.GROUND_ID, scene_module.STONES_ID, NOISE_ID])
    if not known.all():
        raise RuntimeError(f"{(~known).sum()} returns carry a part id this scene never defined")

    row_of = np.full(count + 1, -1, dtype=np.int16)
    for plant in plants:
        row_of[plant.id] = plant.row
    truth_plant = np.where(is_crop, part, 0).astype(np.uint32)
    return {
        "truth_class": truth_class,
        "truth_plant": truth_plant,
        "truth_row": row_of[truth_plant],
        "truth_part": part.astype(np.uint32),
    }


def write_sensor(path: Path, points: dict[str, np.ndarray], spec: FlightSpec) -> None:
    """The file a sensor would deliver. LAS 1.4, point format 6, plus PointId."""
    header = laspy.LasHeader(point_format=6, version="1.4")
    header.add_extra_dim(laspy.ExtraBytesParams(name="PointId", type=np.uint32))
    xyz = np.column_stack([points["x"], points["y"], points["z"]]) + FALSE_ORIGIN
    header.offsets = np.floor(xyz.min(axis=0))
    header.scales = np.array([0.001, 0.001, 0.001])

    las = laspy.LasData(header)
    las.x, las.y, las.z = xyz[:, 0], xyz[:, 1], xyz[:, 2]
    # SCALED PER FLIGHT, to put the 99th percentile at 40000 of 65535.
    #
    # A first version used a fixed gain, calibrated on one run, and saturated
    # every single return at 65535 on the next: HELIOS++'s raw intensity
    # depends on beam divergence as well as range, so no constant survives a
    # change of spec. More to the point, a fixed gain would have implied
    # something false. Intensity from a real sensor is an uncalibrated digital
    # number that differs between sensors, flights and firmware, and a
    # pipeline that leaned on its absolute value would work on the simulator
    # and nowhere else. Scaling per flight delivers exactly what a real file
    # delivers -- ratios within the flight, which are preserved here to the
    # quantisation -- and nothing a real file does not.
    raw = points["intensity"]
    gain = 40000.0 / max(float(np.percentile(raw, 99)), 1e-12)
    las.intensity = np.clip(raw * gain, 0, 65535).astype(np.uint16)
    las.return_number = points["return_number"].astype(np.uint8)
    las.number_of_returns = points["number_of_returns"].astype(np.uint8)
    las.gps_time = points["gps_time"]
    # Point format 6 stores scan angle in units of 0.006 degrees.
    las.scan_angle = np.clip(np.round(points["scan_angle"] / 0.006), -30000, 30000).astype(np.int16)
    las.point_source_id = (points["line"] + 1).astype(np.uint16)
    las.PointId = np.arange(len(xyz), dtype=np.uint32)
    las.write(path)


def write_truth(path: Path, truth: dict[str, np.ndarray]) -> None:
    """Indexed by PointId: element i describes the point whose PointId is i."""
    np.savez_compressed(path, **truth)


def plant_table(
    plants: list[field_module.Plant],
    library: field_module.ModelLibrary,
    terrain: Terrain,
    params: FieldParams,
    truth: dict[str, np.ndarray],
) -> list[dict]:
    """One row per plant, in the sensor file's coordinates.

    `height` is GEOMETRIC: the top of the plant's mesh as posed, above its
    base. It is neither the height CropCraft recorded (which is for the wrong
    model -- see field.py) nor the corrected nominal one (which ignores tilt
    and where the asset's origin sits). On the first field the three differed
    by 9 cm and 3 cm on plants about 40 cm tall, and only this one is what a
    perfect sensor would measure.
    """
    returns = np.bincount(truth["truth_plant"], minlength=len(plants) + 1)
    rows = []
    for plant in plants:
        vertices, _ = field_module.place_plant(plant, library)
        base = float(terrain.height(plant.x, plant.y))
        rows.append(
            {
                "plant": plant.id,
                "row": plant.row,
                "slot": params.slot(plant.x),
                "x": round(plant.x + FALSE_ORIGIN[0], 4),
                "y": round(plant.y + FALSE_ORIGIN[1], 4),
                "z_base": round(base + FALSE_ORIGIN[2], 4),
                "height": round(float(vertices[:, 2].max() - plant.z), 4),
                "reach": round(float(np.hypot(vertices[:, 0] - plant.x, vertices[:, 1] - plant.y).max()), 4),
                "model": plant.model,
                "returns": int(returns[plant.id]),
            }
        )
    return rows


def write_table(path: Path, rows: list[dict]) -> None:
    with open(path, "w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
