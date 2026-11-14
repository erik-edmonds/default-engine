"""Meshes: reading CropCraft's assets, placing plants, and proving the result.

THE ONE JOB THAT EVERYTHING DOWNSTREAM DEPENDS ON. CropCraft's
`field_description` output records, for every crop plant, a position, three
Euler angles, a height and the asset file it was instanced from. Its
`gazebo_model` output writes the same plants as one merged mesh with no
per-plant identity at all. To label a simulated return with the plant it came
from, each plant's mesh has to be rebuilt from the description -- and a rebuild
that is subtly wrong (angles in the wrong order, scale off by the tolerance
band) produces plants that look entirely plausible in slightly the wrong place.

So the rebuild is checked against CropCraft's own export, vertex for vertex,
and the check is a gate: `validate_against_export` raises rather than warns.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree


def read_obj(path: str | Path) -> tuple[np.ndarray, np.ndarray]:
    """Vertices (n, 3) and TRIANGLES (m, 3), zero-based.

    Polygons are fan-triangulated. CropCraft's assets and its exports both
    contain quads and n-gons -- the smoke-test maize mesh has 103,764 vertices
    for 68,822 faces -- and a ray caster wants triangles. A fan is exact for
    the convex, near-planar leaf polygons these files hold.

    Only `v` and `f` are read. Texture coordinates and normals are irrelevant
    to a range measurement, and material names are assigned by the caller,
    which knows what the mesh is.
    """
    vertices: list[tuple[float, float, float]] = []
    triangles: list[tuple[int, int, int]] = []
    with open(path) as handle:
        for line in handle:
            if line.startswith("v "):
                parts = line.split()
                vertices.append((float(parts[1]), float(parts[2]), float(parts[3])))
            elif line.startswith("f "):
                # "f 3/1/2 4/2/2 ..." -- the vertex index is the part before
                # the first slash, and it is one-based. Negative (relative)
                # indices are legal OBJ and are resolved against the vertices
                # read so far.
                idx = []
                for token in line.split()[1:]:
                    i = int(token.split("/")[0])
                    idx.append(i - 1 if i > 0 else len(vertices) + i)
                for k in range(1, len(idx) - 1):
                    triangles.append((idx[0], idx[k], idx[k + 1]))
    return np.asarray(vertices, dtype=np.float64), np.asarray(triangles, dtype=np.int32)


def write_obj(
    path: str | Path,
    vertices: np.ndarray,
    triangles: np.ndarray,
    mtllib: str | None = None,
    material: str | None = None,
) -> None:
    """A plain triangle OBJ, optionally bound to one material.

    Six decimals: a micrometre, far below anything a LiDAR resolves, and it
    keeps files that are written by the thousand small.
    """
    with open(path, "w") as handle:
        if mtllib:
            handle.write(f"mtllib {mtllib}\n")
        np.savetxt(handle, vertices, fmt="v %.6f %.6f %.6f")
        if material:
            handle.write(f"usemtl {material}\n")
        np.savetxt(handle, triangles + 1, fmt="f %d %d %d")


def euler_xyz(roll: float, pitch: float, yaw: float) -> np.ndarray:
    """Blender's XYZ Euler rotation as a matrix: Rz(yaw) @ Ry(pitch) @ Rx(roll).

    CropCraft stores `[roll, pitch, yaw]` in a point attribute and feeds it to
    the Rotation input of an Instance on Points node, which interprets it as an
    XYZ Euler: rotate about X first, then Y, then Z, all about fixed axes.

    This is the convention `validate_against_export` exists to confirm. The
    tilts are small (a standard deviation of a few hundredths of a radian), so
    getting the ORDER wrong moves a leaf tip by well under a centimetre -- an
    error that would never be seen and would quietly blur every per-plant
    label near a neighbour.
    """
    cx, sx = np.cos(roll), np.sin(roll)
    cy, sy = np.cos(pitch), np.sin(pitch)
    cz, sz = np.cos(yaw), np.sin(yaw)
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return rz @ ry @ rx


def place(vertices: np.ndarray, scale: float, rotation: np.ndarray, translation: np.ndarray) -> np.ndarray:
    """Scale about the origin, rotate, translate -- the order an instance uses."""
    return (vertices * scale) @ rotation.T + translation


def validate_against_export(
    rebuilt: np.ndarray, exported: np.ndarray, tolerance_m: float = 1e-3
) -> dict[str, float]:
    """Assert a rebuilt mesh occupies the same space as CropCraft's export.

    Compared as POINT SETS, in both directions, rather than index by index:
    Blender's OBJ importer is free to reorder or split vertices, so the two
    files need not list them in the same order, but every rebuilt vertex must
    have an exported vertex on top of it and vice versa. One direction alone
    would pass a rebuild that was missing plants.

    RAISES on failure. A rebuild that disagrees with the generator's own mesh
    means the per-plant labels are wrong, and nothing measured against them
    would mean anything.
    """
    if len(rebuilt) != len(exported):
        raise AssertionError(
            f"vertex count differs: rebuilt {len(rebuilt):,} against exported {len(exported):,}.\n"
            "A plant is missing or duplicated, or an asset was read differently."
        )
    forward, _ = cKDTree(exported).query(rebuilt)
    backward, _ = cKDTree(rebuilt).query(exported)
    worst = float(max(forward.max(), backward.max()))
    stats = {
        "vertices": float(len(rebuilt)),
        "worst_m": worst,
        "mean_m": float((forward.mean() + backward.mean()) / 2),
    }
    if worst > tolerance_m:
        raise AssertionError(
            f"rebuilt mesh is up to {worst * 1000:.2f} mm from CropCraft's export "
            f"(tolerance {tolerance_m * 1000:.1f} mm).\n"
            "The rotation convention or the scale recovery is wrong. Per-plant labels\n"
            "built on this would be attached to the wrong geometry."
        )
    return stats
