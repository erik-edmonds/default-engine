"""Describe a field, and have CropCraft build it.

A field is a `FieldParams`: everything that distinguishes one synthetic field
from another, drawn from a seed. CropCraft (INRAE Romea, Apache-2.0) turns it
into plant placements and meshes. Run `sim/setup.sh` first.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np
import yaml

HERE = Path(__file__).resolve().parent
CROPCRAFT = HERE / ".cache" / "cropcraft"
BLENDER_SITE = HERE / ".cache" / "blender-site"
BLENDER = os.environ.get("CROPCRAFT_BLENDER", "/Applications/Blender.app/Contents/MacOS/Blender")

WEED_SPECIES = ("portulaca", "polygonum", "taraxacum")

# CropCraft's maize assets, by declared height, in description.yaml order.
# Duplicated here only to check a sampled height has a model to use BEFORE
# launching Blender; field.ModelLibrary reads the real file for everything
# that matters.
_MAIZE_HEIGHTS = (0.21, 0.35, 0.49, 0.40, 0.45)


@dataclass(frozen=True)
class FieldParams:
    """One field. Lengths in metres, angles in radians unless named otherwise."""

    name: str
    seed: int
    rows: int
    plants_per_row: int
    # 0.76 m is 30-inch rows: the paper's field, and the US standard for maize.
    row_spacing: float = 0.76
    plant_spacing: float = 0.16
    plant_height: float = 0.40
    height_tolerance: float = 0.25
    headland: float = 3.0
    position_noise: float = 0.015
    tilt_noise: float = 0.06
    scale_noise: float = 0.12
    missing: float = 0.08
    weeds: dict[str, dict[str, float]] = field(default_factory=dict)
    stones_density: float = 20.0
    # Rows follow y = amplitude * sin(2 pi x / wavelength). Zero is straight.
    curve_amplitude: float = 0.0
    curve_wavelength: float = 20.0
    # Soil reflectance at the scanner's wavelength, in PERCENT, which is the
    # unit HELIOS++'s `helios_reflectance` takes. Randomised because it is not
    # a detail: in a footprint that straddles a leaf and the soil, the brighter
    # surface wins the echo, so a darker soil returns measurably MORE plant
    # points from the identical flight -- 18% more in the test that found this.
    soil_reflectance: float = 25.0
    # Direction of flight relative to the rows, in degrees.
    flight_heading: float = 0.0

    def row_offset(self, x) -> np.ndarray:
        """Lateral displacement of every row at x -- CropCraft's `y_function`."""
        x = np.asarray(x, dtype=float)
        if not self.curve_amplitude:
            return np.zeros_like(x)
        return self.curve_amplitude * np.sin(2 * math.pi * x / self.curve_wavelength)

    def row_centre(self, row: int) -> float:
        """Cross-row position of a row before `row_offset`.

        CropCraft centres the rows in the bed, and the bed here is exactly
        `rows * row_spacing` wide, so the first row sits half a spacing in.
        """
        return self.row_spacing / 2.0 + row * self.row_spacing

    def slot(self, x: float) -> int:
        """Which planting position along the row a plant at x occupies.

        Recoverable because CropCraft's position noise is a centimetre or two
        against a spacing of fifteen: rounding to the grid is unambiguous, and
        the slots with no plant in them are the emergence gaps.
        """
        return int(round(x / self.plant_spacing))

    def cropcraft_config(self) -> dict:
        y_function = (
            f"{self.curve_amplitude!r} * sin(x * tau / {self.curve_wavelength!r})"
            if self.curve_amplitude
            else "0.0"
        )
        config = {
            "output": {
                "model": {"type": "gazebo_model", "name": "model"},
                "description": {"type": "field_description", "filename": "description.json"},
            },
            "field": {
                "headland_width": self.headland,
                "random_seed": self.seed,
                "beds": {
                    "maize": {
                        "plant_type": "maize",
                        "plant_height": self.plant_height,
                        "height_tolerance_coeff": self.height_tolerance,
                        "row_distance": self.row_spacing,
                        "rows_count": self.rows,
                        "bed_width": self.rows * self.row_spacing,
                        "plants_count": self.plants_per_row,
                        "plant_distance": self.plant_spacing,
                        "y_function": y_function,
                    }
                },
                "noise": {
                    "position": self.position_noise,
                    "tilt": self.tilt_noise,
                    "scale": self.scale_noise,
                    "missing": self.missing,
                },
            },
        }
        if self.weeds:
            config["field"]["weeds"] = {
                name: {"plant_type": name, **settings} for name, settings in self.weeds.items()
            }
        if self.stones_density > 0:
            config["field"]["stones"] = {"density": self.stones_density}
        return config


def has_model(plant_height: float, tolerance: float) -> bool:
    low, high = (1 - tolerance) * plant_height, (1 + tolerance) * plant_height
    return any(low <= h <= high for h in _MAIZE_HEIGHTS)


def sample_params(
    name: str, seed: int, rows: int = 24, plants_per_row: int = 150, profile: str = "standard"
) -> FieldParams:
    """A field drawn from the early-season ranges.

    `profile` selects the out-of-distribution test fields. They are not harder
    versions of the standard field; they differ in a property the standard
    ones never vary, which is what makes them a test of generalisation rather
    than of fit:

      "curved"   rows that bend, under heavier weed pressure
      "spacing"  a row spacing no training field has
    """
    rng = np.random.default_rng(seed)

    plant_height = float(rng.uniform(0.22, 0.47))
    tolerance = 0.25
    if not has_model(plant_height, tolerance):
        raise ValueError(f"no maize model within {tolerance:.0%} of {plant_height:.2f} m")

    weed_scale = 2.0 if profile == "curved" else 1.0
    weeds = {}
    for species in WEED_SPECIES:
        # One field in five has none of a given species, so "no weeds here" is
        # something the classifier sees in training rather than only weeds.
        if rng.random() < 0.2 and profile != "curved":
            continue
        weeds[species] = {
            "density": float(rng.uniform(0.5, 5.0) * weed_scale),
            "noise_scale": float(rng.uniform(0.2, 0.5)),
            "noise_offset": float(rng.uniform(-0.1, 0.3)),
        }

    return FieldParams(
        name=name,
        seed=seed,
        rows=rows,
        plants_per_row=plants_per_row,
        row_spacing=0.70 if profile == "spacing" else 0.76,
        plant_spacing=float(rng.uniform(0.14, 0.20)),
        plant_height=plant_height,
        height_tolerance=tolerance,
        position_noise=float(rng.uniform(0.008, 0.03)),
        tilt_noise=float(rng.uniform(0.03, 0.10)),
        scale_noise=float(rng.uniform(0.08, 0.20)),
        missing=float(rng.uniform(0.02, 0.25)),
        weeds=weeds,
        stones_density=float(rng.uniform(0.0, 40.0)),
        curve_amplitude=float(rng.uniform(0.15, 0.30)) if profile == "curved" else 0.0,
        curve_wavelength=float(rng.uniform(15.0, 30.0)),
        soil_reflectance=float(rng.uniform(15.0, 35.0)),
        flight_heading=float(rng.choice([0.0, 30.0, 60.0, 90.0])),
    )


def run_cropcraft(params: FieldParams, out_dir: Path) -> tuple[Path, Path]:
    """Generate the field. Returns the description file and the mesh directory.

    Blender is launched the way cropcraft.py launches it, minus its `click`
    wrapper: that script only assembles this command line. The working
    directory has to be the CropCraft checkout because its PlantManager finds
    assets through a relative path.
    """
    if not (CROPCRAFT / "core" / "blender_entrypoint.py").exists():
        raise RuntimeError("CropCraft is not set up -- run sim/setup.sh")
    # Absolute, because Blender is started from the CropCraft checkout and
    # would otherwise look for a relative config path in there.
    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    config_path = out_dir / "field.yaml"
    config_path.write_text(yaml.safe_dump(params.cropcraft_config(), sort_keys=False))
    (out_dir / "params.json").write_text(json.dumps(asdict(params), indent=2))

    # PYTHONPATH is what stops CropCraft pip-installing into Blender.app: its
    # core/__init__.py installs whatever find_spec cannot see.
    env = dict(os.environ, PYTHONPATH=str(BLENDER_SITE))
    proc = subprocess.run(
        [
            BLENDER, "--background", "--python-use-system-env", "--python",
            str(CROPCRAFT / "core" / "blender_entrypoint.py"), "--", str(config_path), str(out_dir),
        ],
        cwd=CROPCRAFT, env=env, capture_output=True, text=True,
    )
    description = out_dir / "description.json"
    meshes_dir = out_dir / "model" / "meshes"
    if proc.returncode != 0 or not description.exists() or not (meshes_dir / "maize.obj").exists():
        tail = "\n".join((proc.stdout + proc.stderr).strip().splitlines()[-15:])
        raise RuntimeError(f"CropCraft failed ({proc.returncode}):\n{tail}")
    if "Successfully installed" in proc.stdout:
        raise RuntimeError(
            "CropCraft pip-installed a package into Blender's own Python during this run.\n"
            "sim/setup.sh is supposed to make that unnecessary -- its package list is stale."
        )
    return description, meshes_dir
