"""Fly a simulated LiDAR survey over a scene with HELIOS++.

HELIOS++ (Heidelberg 3DGeo, LGPL) is the simulator; this module plans the
flight lines, writes its XML, runs it, and reads what comes back. Everything
about how it is driven here was established by running it, and the notes
below record what was found, because several of them contradict what one
would assume:

  * ITS LAS WRITER DOES NOT WORK in the conda-forge 2.2.2 osx-arm64 build.
    Both `--lasOutput` and `--lasOutput --zipOutput` stop with "there should
    be 1 bytes of data in header->user_data_in_header" and leave a 375-byte
    file with no points. The default text output is complete -- eleven
    columns including the object id and class of every return -- and numpy
    reads it at about 1.5 million rows a second, so that is what is used.

  * A SPINNING HEAD NEEDS ITS OWN MOUNT. The bundled `vlp16` is defined for a
    tripod, rotating about the vertical. Turned 90 degrees about x, the
    rotation axis lies along the flight line and the beams sweep the
    cross-track plane. Verified from the output, not from the XML: sixteen
    beams at exactly -15 to +15 degrees fore and aft in 2-degree steps.

  * A BUILT SCENE IS CACHED BESIDE ITS XML and reused on the next run. For a
    scene that is regenerated under the same name that means simulating the
    PREVIOUS field's geometry against this field's labels, so every run forces
    a rebuild and writes no cache.
"""

from __future__ import annotations

import math
import subprocess
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from specs import FlightSpec

# HELIOS++'s text output, in file order.
COLUMNS = (
    "x", "y", "z", "intensity", "echo_width", "return_number",
    "number_of_returns", "fullwave_index", "object_id", "helios_class", "gps_time",
)

# Fixed, so the same seed gives the same file. Left unset, HELIOS++ stamps
# returns with the wall-clock time of the run and no two runs agree.
GPS_START = "2026-06-08 15:00:00"

# How fast the platform crosses between lines with the scanner off. Nothing is
# recorded during a transit, so this only shortens the simulated time.
TRANSIT_MPS = 20.0


@dataclass(frozen=True)
class FlightLine:
    start: tuple[float, float]
    end: tuple[float, float]


def plan_lines(
    bounds: tuple[float, float, float, float], spec: FlightSpec, heading_deg: float = 0.0
) -> list[FlightLine]:
    """Parallel lines covering a rectangle with the spec's side overlap.

    `bounds` is (x_min, x_max, y_min, y_max); `heading_deg` is the direction
    of flight, anticlockwise from +x, so 0 flies along CropCraft's rows and 90
    across them.

    THE LINES EXTEND PAST THE FIELD ON EVERY SIDE, and both margins are
    derived rather than padded. Along the line, a head whose beams reach
    15 degrees fore and aft has to overrun by `altitude * tan(15)` for the
    trailing beams to reach the field's end. Across it, the outermost lines
    sit beyond the field edge by half a swath less half a spacing, which is
    what gives a point on the boundary the same number of looks as a point in
    the middle -- without it the edges of every field would be systematically
    sparser than its centre, and edge effects would be baked into every
    statistic.
    """
    x_min, x_max, y_min, y_max = bounds
    theta = math.radians(heading_deg)
    along = np.array([math.cos(theta), math.sin(theta)])
    across = np.array([-math.sin(theta), math.cos(theta)])

    corners = np.array([[x_min, y_min], [x_max, y_min], [x_max, y_max], [x_min, y_max]])
    a = corners @ along
    c = corners @ across

    spacing = spec.line_spacing_m
    reach = max(spec.swath_m / 2.0 - spacing / 2.0, 0.0)
    c_low, c_high = c.min() - reach, c.max() + reach
    count = max(1, int(math.ceil((c_high - c_low) / spacing)) + 1)
    # Centred on the field, so the pattern is symmetric about it.
    centre = (c.min() + c.max()) / 2.0
    offsets = centre + spacing * (np.arange(count) - (count - 1) / 2.0)

    a_low, a_high = a.min() - spec.overrun_m - 1.0, a.max() + spec.overrun_m + 1.0
    lines = []
    for k, offset in enumerate(offsets):
        p0 = along * a_low + across * offset
        p1 = along * a_high + across * offset
        # Boustrophedon: alternate direction, as an aircraft would fly it.
        if k % 2:
            p0, p1 = p1, p0
        lines.append(FlightLine((float(p0[0]), float(p0[1])), (float(p1[0]), float(p1[1]))))
    return lines


def helios_data_dir() -> Path:
    import pyhelios

    return Path(pyhelios.__file__).parent / "data"


def write_assets(scene_dir: Path, spec: FlightSpec) -> tuple[str, str]:
    """The platform and scanner definitions this spec needs, beside the scene.

    The scanner is CLONED from the installed HELIOS++ definition and then
    overridden, rather than written out by hand, so that everything this
    project does not deliberately change -- channel layout, pulse length,
    range limits -- stays whatever the installed simulator says it is.
    """
    platforms = ET.Element("document")
    spin = ET.SubElement(platforms, "platform", id="uav_spin", name="UAV, spinning head", type="linearpath")
    ET.SubElement(ET.SubElement(spin, "scannerMount", x="0", y="0", z="0"), "rot", axis="x", angle_deg="90")
    nadir = ET.SubElement(platforms, "platform", id="uav_nadir", name="UAV, nadir", type="linearpath")
    ET.SubElement(ET.SubElement(nadir, "scannerMount", x="0", y="0", z="0"), "rot", axis="x", angle_deg="180")
    ET.ElementTree(platforms).write(scene_dir / "platforms.xml", xml_declaration=True, encoding="UTF-8")

    source = ET.parse(helios_data_dir() / spec.scanner_file).getroot()
    scanner = next((s for s in source.iter("scanner") if s.get("id") == spec.scanner_id), None)
    if scanner is None:
        raise ValueError(f"HELIOS++ has no scanner {spec.scanner_id!r} in {spec.scanner_file}")
    for key, value in spec.scanner_overrides.items():
        if key not in scanner.attrib:
            raise ValueError(f"{spec.scanner_id} has no attribute {key!r} to override")
        scanner.set(key, value)
    scanner.set("id", f"spec_{spec.id}")
    scanners = ET.Element("document")
    scanners.append(scanner)
    ET.ElementTree(scanners).write(scene_dir / "scanners.xml", xml_declaration=True, encoding="UTF-8")

    return f"platforms.xml#uav_{spec.mount}", f"scanners.xml#spec_{spec.id}"


def write_survey(
    scene_dir: Path, name: str, spec: FlightSpec, lines: list[FlightLine], scene_ref: str, base_z: float
) -> Path:
    """The survey XML: one scanning leg per line, and a silent transit between."""
    platform_ref, scanner_ref = write_assets(scene_dir, spec)
    document = ET.Element("document")
    survey = ET.SubElement(
        document, "survey", name=name, platform=platform_ref, scanner=scanner_ref, scene=scene_ref
    )

    def settings(active: bool) -> dict[str, str]:
        return {
            "active": "true" if active else "false",
            "pulseFreq_hz": str(spec.pulse_freq_hz),
            "scanAngle_deg": f"{spec.scan_angle_deg:g}",
            "scanFreq_hz": f"{spec.scan_freq_hz:g}",
            "headRotatePerSec_deg": f"{spec.head_rotate_deg_s:g}",
            "headRotateStart_deg": "0",
            "headRotateStop_deg": "0",
            "trajectoryTimeInterval_s": "0.01",
        }

    z = f"{base_z + spec.altitude_m:.3f}"
    for line in lines:
        # A leg's settings govern the travel TO the next leg, so the start of
        # a line is active at survey speed and its end is inactive at transit
        # speed.
        for (x, y), active, speed in ((line.start, True, spec.speed_mps), (line.end, False, TRANSIT_MPS)):
            leg = ET.SubElement(survey, "leg")
            ET.SubElement(
                leg, "platformSettings", x=f"{x:.3f}", y=f"{y:.3f}", z=z, onGround="false",
                movePerSec_m=f"{speed:g}",
            )
            ET.SubElement(leg, "scannerSettings", **settings(active))

    path = scene_dir / f"{name}.xml"
    ET.ElementTree(document).write(path, xml_declaration=True, encoding="UTF-8")
    return path


def run(scene_dir: Path, survey_xml: Path, seed: int, threads: int = 8) -> Path:
    """Run HELIOS++ and return the directory holding this run's legs."""
    helios = Path(sys.executable).parent / "helios"
    output = scene_dir / "out"
    command = [
        str(helios), survey_xml.name, "--assets", ".", "--output", output.name,
        "--seed", str(seed), "--gpsStartTime", GPS_START, "-j", str(threads),
        "--rebuildScene", "--noSceneWriting",
    ]
    proc = subprocess.run(command, cwd=scene_dir, capture_output=True, text=True)
    if proc.returncode != 0:
        tail = "\n".join((proc.stdout + proc.stderr).strip().splitlines()[-15:])
        raise RuntimeError(f"helios failed ({proc.returncode}):\n{tail}")
    runs = sorted((output / survey_xml.stem).glob("*/"))
    if not runs:
        raise RuntimeError("helios reported success but wrote no output directory")
    return runs[-1]


def read_legs(run_dir: Path, lines: list[FlightLine]) -> dict[str, np.ndarray]:
    """Every return from every line, with the line it came from and its scan angle.

    The scan angle is the signed cross-track angle from nadir, recovered from
    the recorded trajectory rather than from the scanner model, so it means
    the same thing for a spinning head and a line scanner -- and it is the
    quantity a real LAS file carries.
    """
    chunks: dict[str, list[np.ndarray]] = {name: [] for name in COLUMNS + ("line", "scan_angle")}
    for points_file in sorted(run_dir.glob("leg*_points.xyz")):
        leg = int(points_file.name[3:6])
        if leg % 2:
            raise RuntimeError(f"{points_file.name}: returns recorded on a transit leg")
        line_index = leg // 2
        if points_file.stat().st_size == 0:
            continue
        data = np.loadtxt(points_file, ndmin=2)
        if data.shape[1] != len(COLUMNS):
            raise RuntimeError(f"{points_file.name}: {data.shape[1]} columns, expected {len(COLUMNS)}")
        trajectory = np.loadtxt(run_dir / f"leg{leg:03d}_trajectory.txt", ndmin=2)

        t = data[:, COLUMNS.index("gps_time")]
        platform = np.column_stack([np.interp(t, trajectory[:, 3], trajectory[:, k]) for k in range(3)])
        look = data[:, :3] - platform
        line = lines[line_index]
        direction = np.array(line.end) - np.array(line.start)
        direction /= np.linalg.norm(direction)
        left = np.array([-direction[1], direction[0]])
        angle = np.degrees(np.arctan2(look[:, :2] @ left, -look[:, 2]))

        for k, name in enumerate(COLUMNS):
            chunks[name].append(data[:, k])
        chunks["line"].append(np.full(len(data), line_index, dtype=np.int32))
        chunks["scan_angle"].append(angle)

    if not chunks["x"]:
        raise RuntimeError(f"no returns in {run_dir}")
    return {name: np.concatenate(parts) for name, parts in chunks.items()}
