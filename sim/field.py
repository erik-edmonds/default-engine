"""CropCraft's ground truth, read into plants and turned back into geometry.

`field_description` is the reason a synthetic field is worth more than a real
one for building a pipeline: it lists every crop plant with its position, pose
and height. This module reads it, gives every plant a stable id, and rebuilds
each plant's mesh so that a simulated return can be traced to the plant that
produced it.

THE DESCRIPTION IS WRONG ABOUT WHICH MODEL EACH PLANT IS, and this module
corrects it. Found by `meshes.validate_against_export`, at CropCraft
78f2205:

  * core/beds.py picks `index = randint(0, n - 1)` and records
    `plant_models[index].filename` -- indexing the PYTHON list, which is in
    description.yaml order filtered by height.
  * The same `index` is handed to an Instance on Points node whose instances
    come from a Collection Info node with Separate Children, and Blender hands
    a collection's children out SORTED BY OBJECT NAME. core/model_import.py
    names each imported object after its file stem.

So the mesh instanced is `sorted(stems)[index]` while the file recorded is
`description_order[index]`. For maize the yaml order is small, medium, big_1,
big_2, big_3 and the sorted order is big_1, big_2, big_3, medium, small, so
any bed whose height tolerance admits both a "big" and a "medium" model
records the wrong file for every plant -- 434 of 434 in the first field
generated here -- and with it the wrong height, width and leaf area. The
recorded height was off by 9.0 cm on average against the geometry actually in
the scene, on plants about 40 cm tall.

Position, rotation and the scale FACTOR are unaffected: they are computed
before the model is chosen. So the correction is exact, and the rebuilt mesh
then agrees with CropCraft's own export to about a micrometre.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import yaml

import meshes


@dataclass(frozen=True)
class Plant:
    """One crop plant, as it actually exists in the generated scene.

    `id` starts at 1 so that 0 can mean "not a plant" in a per-point label.
    `row` runs across the whole field, not per bed, because a row index that
    restarts at every bed is useless to anything downstream of the generator.

    `model` and `height` are the CORRECTED values -- see the module note.
    `recorded_model` is what the description file claims, kept so the size of
    the upstream error stays measurable.
    """

    id: int
    row: int
    x: float
    y: float
    z: float
    roll: float
    pitch: float
    yaw: float
    scale: float
    model: str
    height: float
    recorded_model: str
    recorded_height: float


def candidate_models(heights: dict[str, float], plant_height: float, tolerance: float) -> list[str]:
    """The list CropCraft indexes in Python, in the order it indexes it.

    A replica of PlantManager.get_model_list_by_height: description.yaml order,
    kept where `(1 - tol) * h <= model.height <= (1 + tol) * h`. `heights` must
    therefore preserve the file's order, which a dict built from it does.
    """
    low, high = (1 - tolerance) * plant_height, (1 + tolerance) * plant_height
    return [name for name, h in heights.items() if low <= h <= high]


def instanced_order(candidates: list[str]) -> list[str]:
    """The order Blender's Collection Info node hands the same models out in.

    Sorted by object name, and CropCraft names each object after its file
    stem. Sorting the stems rather than the filenames matters in principle --
    "a.obj" and "a_b.obj" compare differently with and without the extension
    -- even though for the shipped assets the two agree.
    """
    return sorted(candidates, key=lambda name: Path(name).stem)


def load_description(path: str | Path, library: "ModelLibrary") -> tuple[dict, list[Plant]]:
    """The generator's configuration, and every plant it actually placed.

    Plants removed by the `missing` probability are simply absent -- CropCraft
    skips them before recording anything -- so the list is the stand as it
    exists, and the gaps are recovered separately from the planting grid.
    """
    with open(path) as handle:
        data = json.load(handle)
    config = data["config"]

    # One BedState is recorded per repetition of each bed configuration, in
    # configuration order, so the state list is the config list with each
    # entry repeated `beds_count` times.
    bed_configs = [bed for bed in config["beds"] for _ in range(bed.get("beds_count", 1))]
    bed_states = data["field"]["beds"]
    if len(bed_configs) != len(bed_states):
        raise ValueError(
            f"{len(bed_states)} beds recorded but the configuration implies {len(bed_configs)}"
        )

    plants: list[Plant] = []
    row_index = 0
    for bed_config, bed_state in zip(bed_configs, bed_states):
        recorded_order = candidate_models(
            library.heights, bed_config["plant_height"], bed_config["height_tolerance_coeff"]
        )
        actual = dict(zip(recorded_order, instanced_order(recorded_order)))

        for row in bed_state["rows"]:
            for crop in row["crops"]:
                recorded = crop["filename"]
                # The scale factor is recovered from the RECORDED model,
                # because that is the one whose height CropCraft multiplied by
                # it. It then applies to the model actually instanced.
                scale = crop["height"] / library.heights[recorded]
                model = actual[recorded]
                plants.append(
                    Plant(
                        id=len(plants) + 1,
                        row=row_index,
                        x=crop["x"],
                        y=crop["y"],
                        z=crop["z"],
                        roll=crop["roll"],
                        pitch=crop["pitch"],
                        yaw=crop["yaw"],
                        scale=scale,
                        model=model,
                        height=library.heights[model] * scale,
                        recorded_model=recorded,
                        recorded_height=crop["height"],
                    )
                )
            row_index += 1
    return config, plants


class ModelLibrary:
    """The plant assets, read once, with the heights CropCraft scales from."""

    def __init__(self, cropcraft_dir: str | Path, plant_type: str):
        self.directory = Path(cropcraft_dir) / "assets" / "plants" / plant_type
        with open(self.directory / "description.yaml") as handle:
            description = yaml.safe_load(handle)
        # In the file's own order: candidate_models depends on it.
        self.heights = {m["filename"]: float(m["height"]) for m in description["models"]}
        self._meshes: dict[str, tuple[np.ndarray, np.ndarray]] = {}

    def mesh(self, filename: str) -> tuple[np.ndarray, np.ndarray]:
        if filename not in self._meshes:
            self._meshes[filename] = meshes.read_obj(self.directory / filename)
        return self._meshes[filename]


def place_plant(plant: Plant, library: ModelLibrary) -> tuple[np.ndarray, np.ndarray]:
    """One plant's vertices in field coordinates, and its triangles."""
    vertices, triangles = library.mesh(plant.model)
    placed = meshes.place(
        vertices,
        plant.scale,
        meshes.euler_xyz(plant.roll, plant.pitch, plant.yaw),
        np.array([plant.x, plant.y, plant.z]),
    )
    return placed, triangles


def rebuild_crops(
    plants: list[Plant], library: ModelLibrary
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Every plant's mesh in field coordinates, as one mesh with an id per triangle."""
    all_vertices: list[np.ndarray] = []
    all_triangles: list[np.ndarray] = []
    owners: list[np.ndarray] = []
    offset = 0
    for plant in plants:
        placed, triangles = place_plant(plant, library)
        all_vertices.append(placed)
        all_triangles.append(triangles + offset)
        owners.append(np.full(len(triangles), plant.id, dtype=np.int32))
        offset += len(placed)
    return np.vstack(all_vertices), np.vstack(all_triangles), np.concatenate(owners)
