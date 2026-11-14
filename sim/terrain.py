"""The ground under the field, because CropCraft's is a mathematical plane.

CropCraft's `ground.obj` is one quad at z = 0; the dry-mud relief in its
renders is a material effect and never reaches the geometry. A LiDAR pipeline
validated on that has had its ground filter tested on the one surface where
every ground filter is trivially right: the lowest point in any cell IS the
ground, exactly, and height above it is just Z.

So the plane is replaced with a surface that has what real seedbeds have --
a slope, slow undulation, ridging that follows the rows, and clod-scale
roughness -- and every plant is lifted onto it.

AN ANALYTIC FUNCTION, NOT A GRID. `Terrain.height(x, y)` can be evaluated at
any point, so a plant's base, a weed's vertices and the ground mesh itself all
get their elevation from the same expression. A gridded heightfield would need
interpolating, and plants would then float or sink by the interpolation error
-- millimetres, but systematically, on exactly the quantity being measured.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable

import numpy as np

# The shortest roughness wavelength, as a multiple of the ground mesh's cell.
# Four cells per wavelength is the least that represents a sinusoid without
# flattening it noticeably; anything finer would exist in `height` but not in
# the mesh the rays actually hit.
MIN_CELLS_PER_WAVELENGTH = 4


@dataclass(frozen=True)
class Wave:
    """One plane wave: amplitude (m), wavelength (m), direction (rad), phase (rad)."""

    amplitude: float
    wavelength: float
    direction: float
    phase: float


@dataclass(frozen=True)
class Terrain:
    """A seedbed surface.

    `row_offset` is the generator's own `y_function`: the lateral displacement
    of the rows at a given x. Ridging follows the rows, so it has to be told
    where they go -- a ridge pattern laid straight across a curved field would
    put furrows through the crop.
    """

    slope_x: float = 0.0
    slope_y: float = 0.0
    undulation: tuple[Wave, ...] = ()
    roughness: tuple[Wave, ...] = ()
    ridge_amplitude: float = 0.0
    row_spacing: float = 0.76
    # Cross-row position of a ridge crest, so crests can sit on the rows.
    ridge_origin: float = 0.0
    row_offset: Callable[[np.ndarray], np.ndarray] = field(
        default=lambda x: np.zeros_like(np.asarray(x, dtype=float)), compare=False
    )

    def height(self, x, y) -> np.ndarray:
        x = np.asarray(x, dtype=float)
        y = np.asarray(y, dtype=float)
        z = self.slope_x * x + self.slope_y * y
        for wave in self.undulation + self.roughness:
            along = x * math.cos(wave.direction) + y * math.sin(wave.direction)
            z = z + wave.amplitude * np.sin(2 * math.pi * along / wave.wavelength + wave.phase)
        if self.ridge_amplitude:
            cross = y - self.row_offset(x) - self.ridge_origin
            z = z + self.ridge_amplitude * np.cos(2 * math.pi * cross / self.row_spacing)
        return z


def sample_terrain(
    rng: np.random.Generator,
    row_spacing: float,
    ridge_origin: float,
    row_offset: Callable[[np.ndarray], np.ndarray] | None = None,
    cell: float = 0.04,
) -> Terrain:
    """A plausible seedbed, drawn from ranges rather than fixed.

    The ranges are deliberately those of a WORKED field, not a landscape: a
    planted maize field is graded and tilled, so the slope is a percent or two
    and the undulation centimetres over tens of metres. The point is not
    scenery; it is that the lowest return in a metre cell stops being the
    ground by construction.
    """
    slope = rng.uniform(0.0, 0.02)
    slope_dir = rng.uniform(0, 2 * math.pi)

    undulation = tuple(
        Wave(
            amplitude=rng.uniform(0.01, 0.04),
            wavelength=rng.uniform(6.0, 25.0),
            direction=rng.uniform(0, math.pi),
            phase=rng.uniform(0, 2 * math.pi),
        )
        for _ in range(3)
    )

    # Clod-scale roughness as a sum of short plane waves in random directions.
    # Twelve of them is enough that no direction or period is visible in the
    # result; each carries an equal share of the variance, and the amplitude
    # of a sinusoid with variance v is sqrt(2 v).
    sigma = rng.uniform(0.004, 0.012)
    count = 12
    shortest = MIN_CELLS_PER_WAVELENGTH * cell
    roughness = tuple(
        Wave(
            amplitude=math.sqrt(2.0 / count) * sigma,
            wavelength=rng.uniform(shortest, 0.45),
            direction=rng.uniform(0, math.pi),
            phase=rng.uniform(0, 2 * math.pi),
        )
        for _ in range(count)
    )

    kwargs = {}
    if row_offset is not None:
        kwargs["row_offset"] = row_offset
    return Terrain(
        slope_x=slope * math.cos(slope_dir),
        slope_y=slope * math.sin(slope_dir),
        undulation=undulation,
        roughness=roughness,
        ridge_amplitude=rng.uniform(0.0, 0.02),
        row_spacing=row_spacing,
        ridge_origin=ridge_origin,
        **kwargs,
    )


def ground_mesh(
    terrain: Terrain, x_min: float, x_max: float, y_min: float, y_max: float, cell: float = 0.04
) -> tuple[np.ndarray, np.ndarray]:
    """The surface as triangles, on a regular grid.

    The grid is snapped outward so it always covers the requested bounds: a
    ground mesh a cell short of the field leaves a strip where rays pass
    through the world and plants hang over nothing.
    """
    nx = int(math.ceil((x_max - x_min) / cell)) + 1
    ny = int(math.ceil((y_max - y_min) / cell)) + 1
    xs = x_min + cell * np.arange(nx)
    ys = y_min + cell * np.arange(ny)
    gx, gy = np.meshgrid(xs, ys, indexing="ij")
    vertices = np.column_stack([gx.ravel(), gy.ravel(), terrain.height(gx, gy).ravel()])

    # Two triangles per cell, wound counter-clockwise seen from above so the
    # surface normal points up.
    i, j = np.meshgrid(np.arange(nx - 1), np.arange(ny - 1), indexing="ij")
    a = (i * ny + j).ravel()
    b = ((i + 1) * ny + j).ravel()
    c = ((i + 1) * ny + j + 1).ravel()
    d = (i * ny + j + 1).ravel()
    triangles = np.concatenate([np.column_stack([a, b, c]), np.column_stack([a, c, d])]).astype(np.int32)
    return vertices, triangles
