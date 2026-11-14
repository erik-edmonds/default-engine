"""Flight specifications: which sensor, how high, how fast, how much overlap.

A spec is what a pilot would be handed. The baseline is the acquisition in the
paper this project's ground method comes from; the others exist to answer the
question a simulation is uniquely placed to answer before any data is bought:
what has to be flown for a given product to work.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass(frozen=True)
class FlightSpec:
    id: str
    label: str
    # The HELIOS++ scanner this starts from: a file in its bundled data
    # directory and an id within it.
    scanner_file: str
    scanner_id: str
    # Attributes of that scanner definition to replace, as XML attribute
    # strings. Empty means the bundled definition is used unchanged.
    scanner_overrides: dict[str, str] = field(default_factory=dict)
    # "spin": a rotating multi-beam head with its axis along the flight line.
    # "nadir": a line or prism scanner looking straight down.
    mount: str = "spin"
    altitude_m: float = 44.0
    speed_mps: float = 4.0
    side_overlap: float = 0.8
    # Cross-track half angle kept after the flight. A spinning head records
    # all the way round; what a processing chain keeps is a choice, and it is
    # also what "swath" -- and therefore overlap -- is measured against.
    usable_half_angle_deg: float = 35.0
    # How far ahead of and behind nadir the beams reach, which sets how far a
    # line has to overrun the field for every beam to cover its ends.
    fore_aft_half_angle_deg: float = 15.0
    pulse_freq_hz: int = 18750
    scan_angle_deg: float = 0.0
    scan_freq_hz: float = 0.0
    head_rotate_deg_s: float = 3600.0
    # Strip-to-strip misregistration, one standard deviation per axis. Direct
    # georeferencing leaves each flight line with its own few-centimetre
    # offset, and on plants a few centimetres wide that is what turns a crisp
    # leaf into a smear across overlapping strips.
    strip_sigma_m: float = 0.03
    wavelength_nm: int = 905

    @property
    def swath_m(self) -> float:
        return 2.0 * self.altitude_m * math.tan(math.radians(self.usable_half_angle_deg))

    @property
    def line_spacing_m(self) -> float:
        return self.swath_m * (1.0 - self.side_overlap)

    @property
    def overrun_m(self) -> float:
        return self.altitude_m * math.tan(math.radians(self.fore_aft_half_angle_deg))


# KC & Khanal, "Precision maize crop height mapping using multispectral and
# LiDAR data from unmanned aerial system", Precision Agriculture 27:170 (2026):
# a Velodyne VLP-16 Hi-Res on a Freefly Alta X at 44 m above ground and 4 m/s,
# flown in a grid with 80% side overlap, direct-georeferenced to 2-5 cm.
#
# BEAM DIVERGENCE IS THE ONE NUMBER HERE THAT IS NOT PINNED, and it is flagged
# rather than asserted. HELIOS++ ships its VLP-16 with 0.7 mrad -- a 3 cm
# footprint from 44 m. Velodyne's datasheets for this sensor family give about
# 3.0 mrad horizontally by 1.2-1.5 mrad vertically (the HDL-32E sheet states
# 3.0 x 1.2), which is a footprint several times larger; the VLP-16's own
# manual could not be retrieved to confirm its figure. The baseline uses the
# area-equivalent circular divergence of 3.0 x 1.35 mrad, about 2.0 mrad, and
# PAPER_NARROW keeps the bundled 0.7 so the SENSITIVITY of every result to
# this unknown is measured instead of argued about.
#
# The head rate is likewise not stated in the paper, which gives the sensor's
# 5-20 Hz range. 10 Hz (3600 deg/s) is the sensor's default.
PAPER = FlightSpec(
    id="A",
    label="VLP-16, 44 m, 4 m/s, 80% overlap (KC & Khanal 2026)",
    scanner_file="scanners_tls.xml",
    scanner_id="vlp16",
    scanner_overrides={"beamDivergence_rad": "0.002"},
)

PAPER_NARROW = FlightSpec(
    id="A0",
    label="As A, with HELIOS++'s bundled 0.7 mrad beam",
    scanner_file="scanners_tls.xml",
    scanner_id="vlp16",
)

# The same sensor flown the way one would to see small plants: less than half
# the altitude, and slower. Footprint and point spacing both shrink with
# altitude; the range noise does not, which is what this spec isolates.
LOW = FlightSpec(
    id="B",
    label="VLP-16, 20 m, 3 m/s, 80% overlap",
    scanner_file="scanners_tls.xml",
    scanner_id="vlp16",
    scanner_overrides={"beamDivergence_rad": "0.002"},
    altitude_m=20.0,
    speed_mps=3.0,
)

SPECS = {spec.id: spec for spec in (PAPER, PAPER_NARROW, LOW)}
