"""Assemble a HELIOS++ scene from a generated field.

The scene is where ground truth gets its identity. HELIOS++ stamps every
return with the id of the scene part its ray hit, so the way the field is cut
into parts IS the labelling scheme:

  * every crop plant is its own part, with its plant id as the part id, so a
    return on a leaf names the plant it belongs to exactly -- no nearest-plant
    guessing afterwards, which would be wrong precisely where neighbouring
    leaves overlap and the answer matters;
  * the ground, each weed species and the stones are one part each.

Verified by running it: 439 parts load and simulate in a few seconds.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import numpy as np

import field as field_module
import meshes
from generate import WEED_SPECIES, FieldParams
from terrain import Terrain, ground_mesh

# Part ids. Plants take 1..N; everything else sits far above any plant count.
GROUND_ID = 900_001
WEED_ID = {species: 900_011 + k for k, species in enumerate(WEED_SPECIES)}
STONES_ID = 900_021

# Green leaf at 905 nm. `grass` is one of the ten spectra HELIOS++ ships
# (50.8% at 0.9 um) and stands in for maize and weed foliage alike: both sit on
# the near-infrared plateau, and the simulator looks the value up at the
# scanner's own wavelength.
LEAF_SPECTRUM = "grass"


@dataclass(frozen=True)
class Scene:
    directory: Path
    bounds: tuple[float, float, float, float]
    # Mean ground elevation, so "44 m above ground" has a ground to be above.
    base_z: float
    reference: str = "scene.xml#field"


def _materials(soil_reflectance: float) -> str:
    """The material file.

    THREE THINGS ABOUT HELIOS++ MATERIALS, each found by experiment because the
    obvious assumption was wrong:

      * `helios_reflectance` is in PERCENT. 25 halves the default; 0.25 is a
        quarter of one percent and makes a surface nearly invisible.
      * A custom spectrum file placed in an assets directory is silently
        ignored -- the ground's intensity did not change at all. Only the
        bundled spectra are found by name, so soil, which is not among them,
        gets an explicit reflectance instead.
      * `Kd` has no effect on the return.

    A material with neither key defaults to about 50%, which for soil is too
    bright -- and brightness is not cosmetic here. See FieldParams.
    """
    return (
        "newmtl soil\n"
        "helios_classification 2\n"
        "helios_isGround true\n"
        f"helios_reflectance {soil_reflectance:.2f}\n\n"
        "newmtl stone\n"
        "helios_classification 2\n"
        f"helios_reflectance {min(soil_reflectance * 1.3, 60.0):.2f}\n\n"
        "newmtl crop\n"
        "helios_classification 5\n"
        f"helios_spectra {LEAF_SPECTRUM}\n\n"
        "newmtl weed\n"
        "helios_classification 4\n"
        f"helios_spectra {LEAF_SPECTRUM}\n"
    )


def build(
    directory: Path,
    meshes_dir: Path,
    plants: list[field_module.Plant],
    library: field_module.ModelLibrary,
    terrain: Terrain,
    params: FieldParams,
    cell: float = 0.04,
) -> Scene:
    """Write the scene: parts, materials and the XML that binds ids to them."""
    parts_dir = directory / "parts"
    parts_dir.mkdir(parents=True, exist_ok=True)
    (parts_dir / "materials.mtl").write_text(_materials(params.soil_reflectance))
    parts: list[tuple[int, str]] = []

    # The extent CropCraft gave its own ground plane, headland included.
    flat, _ = meshes.read_obj(meshes_dir / "ground.obj")
    bounds = (float(flat[:, 0].min()), float(flat[:, 0].max()), float(flat[:, 1].min()), float(flat[:, 1].max()))
    vertices, triangles = ground_mesh(terrain, *bounds, cell=cell)
    meshes.write_obj(parts_dir / "ground.obj", vertices, triangles, "materials.mtl", "soil")
    parts.append((GROUND_ID, "ground.obj"))
    base_z = float(vertices[:, 2].mean())

    # Weeds and stones are DRAPED: each vertex is lifted by the ground height
    # beneath it. They are a few centimetres tall and the terrain varies over
    # decimetres, so the shear this introduces is far below a millimetre --
    # unlike the crop, which is lifted rigidly below.
    for name, part_id, material in (
        *((species, WEED_ID[species], "weed") for species in params.weeds),
        *((("stones", STONES_ID, "stone"),) if params.stones_density > 0 else ()),
    ):
        source = meshes_dir / f"{name}.obj"
        if not source.exists():
            continue
        v, t = meshes.read_obj(source)
        if len(t) == 0:
            continue
        v[:, 2] += terrain.height(v[:, 0], v[:, 1])
        meshes.write_obj(parts_dir / f"{name}.obj", v, t, "materials.mtl", material)
        parts.append((part_id, f"{name}.obj"))

    # Each crop plant is lifted RIGIDLY by the ground height at its base. A
    # 40 cm plant spans decimetres of ground; draping it would bend its leaves
    # to follow the ridges, and plant height is the quantity under test.
    for plant in plants:
        v, t = field_module.place_plant(plant, library)
        v[:, 2] += float(terrain.height(plant.x, plant.y))
        name = f"crop_{plant.id:06d}.obj"
        meshes.write_obj(parts_dir / name, v, t, "materials.mtl", "crop")
        parts.append((plant.id, name))

    document = ET.Element("document")
    scene = ET.SubElement(document, "scene", id="field", name="field")
    for part_id, name in parts:
        part = ET.SubElement(scene, "part", id=str(part_id))
        loader = ET.SubElement(part, "filter", type="objloader")
        ET.SubElement(loader, "param", type="string", key="filepath", value=f"parts/{name}")
        # Stated, because every mesh here is z-up and HELIOS++ otherwise warns
        # once per part that it is guessing.
        ET.SubElement(loader, "param", type="string", key="up", value="z")
    ET.ElementTree(document).write(directory / "scene.xml", xml_declaration=True, encoding="UTF-8")

    return Scene(directory=directory, bounds=bounds, base_z=base_z)
