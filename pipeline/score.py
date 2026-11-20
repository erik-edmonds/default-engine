"""Score an annotated run against the simulator's per-point ground truth.

THE ONLY PLACE A NUMBER FROM THIS PIPELINE CAN BE CHECKED. Every other claim
the pipeline makes is internal consistency -- the guards in annotate.py catch a
file that is obviously wrong, not one that is plausibly wrong. `sim/` exists so
that for synthetic fields the answer is known per point, and this is what
compares the two.

WHY IT IS A SEPARATE SCRIPT, AND A SEPARATE ENVIRONMENT. The PDAL image has no
numpy -- no scipy, no sklearn either -- and the conda env that has numpy has no
pdal. That is not worth fixing for this: exporting is a header read and a
column dump, scoring is array arithmetic, and keeping them apart means neither
environment has to grow to suit the other. The two steps are:

    # 1. export, where pdal lives
    docker run --rm -v "$PWD:/work" pdal/pdal:latest pdal translate \\
      /work/<annotated>.copc.laz /work/<points>.csv \\
      --writers.text.order="PointId,Classification,HeightAboveGround" \\
      --writers.text.keep_unspecified=false

    # 2. score, where numpy lives
    conda run -n cornsim python pipeline/score.py \\
      --points <points>.csv --truth <truth>.npz --out <scores>.json

POINTID IS LOAD-BEARING AND WAS NOT THERE. COPC reorders every point into its
octree, so row number in the derivative means nothing -- the first row of the
export above is PointId 3891. The truth arrays are indexed by PointId, so
without the key surviving the pipeline these two files cannot be joined at all.
thresholds.copc_writer_stage carries it when the source has it.

THE TWO TAXONOMIES DO NOT MATCH, AND SAYING SO IS HALF THE POINT.

  truth (sim/truth.py):     SOIL 2, WEED 4, CROP 5, NOISE 7
  predicted (hagBands.json): ground 2, then height bands 3 / 4 / 5, noise 7

The predicted labels are HEIGHT BANDS and the truth labels are WHAT THE THING
IS. `4` means "0.5 to 5 m above ground" on one side and "a weed" on the other;
they are not the same claim and scoring them as though they were would invent
an agreement that does not exist. So this reports three things separately:

  1. GROUND vs NON-GROUND, which both taxonomies genuinely agree on and which
     is what the SLG work was actually about. This is the honest headline.
  2. The full confusion matrix over whatever labels appear, as raw counts, so
     the band behaviour is visible rather than summarised away.
  3. An explicit mismatch report -- labels predicted that truth never uses, and
     vice versa.

STATUS.md already records the defect this will measure ("Height bands: wrong
for corn -- a whole field lands in one class"), and pipeline/README.md names
the paper whose field measurements the bands disagree with. This turns that
from a note into a number.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

# What the simulator means by each label. sim/truth.py is the source.
TRUTH_NAMES = {2: "soil", 4: "weed", 5: "crop", 7: "noise"}

# What the pipeline means by each label. config/hagBands.json is the source,
# and it is read by both sides of the pipeline for exactly this reason.
PREDICTED_NAMES = {
    0: "never classified",
    1: "unassigned",
    2: "ground",
    3: "0.1-0.5 m",
    4: "0.5-5 m",
    5: "5 m and above",
    7: "noise",
}

GROUND_CLASS = 2
NOISE_CLASS = 7


def load_points(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """PointId, Classification, HeightAboveGround from the pdal text export."""
    raw = np.loadtxt(path, delimiter=",", skiprows=1)
    if raw.ndim != 2 or raw.shape[1] != 3:
        raise SystemExit(
            f"{path}: expected three columns (PointId, Classification, "
            f"HeightAboveGround), got shape {raw.shape}. Check "
            "--writers.text.order on the export."
        )
    return raw[:, 0].astype(np.int64), raw[:, 1].astype(np.int64), raw[:, 2].astype(np.float64)


def confusion(truth: np.ndarray, predicted: np.ndarray) -> tuple[list[int], list[int], np.ndarray]:
    t_labels = sorted(set(np.unique(truth).tolist()))
    p_labels = sorted(set(np.unique(predicted).tolist()))
    t_index = {v: i for i, v in enumerate(t_labels)}
    p_index = {v: i for i, v in enumerate(p_labels)}
    matrix = np.zeros((len(t_labels), len(p_labels)), dtype=np.int64)
    for t, p in zip(truth, predicted):
        matrix[t_index[int(t)], p_index[int(p)]] += 1
    return t_labels, p_labels, matrix


def binary_scores(truth_ground: np.ndarray, predicted_ground: np.ndarray) -> dict[str, float | int]:
    """Ground against everything else -- the one question both sides ask."""
    tp = int(np.sum(truth_ground & predicted_ground))
    fp = int(np.sum(~truth_ground & predicted_ground))
    fn = int(np.sum(truth_ground & ~predicted_ground))
    tn = int(np.sum(~truth_ground & ~predicted_ground))
    denom = tp + fp + fn
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return {
        "true_positive": tp,
        "false_positive": fp,
        "false_negative": fn,
        "true_negative": tn,
        "iou": round(tp / denom, 5) if denom else 0.0,
        "precision": round(precision, 5),
        "recall": round(recall, 5),
        "f1": round(2 * precision * recall / (precision + recall), 5) if precision + recall else 0.0,
        "accuracy": round((tp + tn) / len(truth_ground), 5),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--points", required=True, type=Path, help="pdal text export of the annotated file")
    ap.add_argument("--truth", required=True, type=Path, help="truth.npz written by sim/truth.py")
    ap.add_argument("--out", type=Path, help="where to write the JSON (default: stdout only)")
    args = ap.parse_args()

    point_id, predicted, hag = load_points(args.points)
    truth_file = np.load(args.truth)
    truth_all = truth_file["truth_class"].astype(np.int64)

    # THE JOIN. Not a zip of two files in whatever order they happen to be in.
    if point_id.min() < 0 or point_id.max() >= truth_all.size:
        raise SystemExit(
            f"PointId runs {point_id.min()}..{point_id.max()} but truth has "
            f"{truth_all.size} entries -- these files are not from the same run."
        )
    if np.unique(point_id).size != point_id.size:
        raise SystemExit("PointId is not unique in the export; the join would be ambiguous.")
    truth = truth_all[point_id]

    t_labels, p_labels, matrix = confusion(truth, predicted)

    # Ground, which is the comparison that means the same thing on both sides.
    ground = binary_scores(truth == GROUND_CLASS, predicted == GROUND_CLASS)

    # Vegetation: everything that is neither ground nor noise, on both sides.
    veg_truth = ~np.isin(truth, [GROUND_CLASS, NOISE_CLASS])
    veg_pred = ~np.isin(predicted, [GROUND_CLASS, NOISE_CLASS])
    vegetation = binary_scores(veg_truth, veg_pred)

    predicted_only = sorted(set(p_labels) - set(t_labels))
    truth_only = sorted(set(t_labels) - set(p_labels))

    report = {
        "points": int(point_id.size),
        "ground_vs_rest": ground,
        "vegetation_vs_rest": vegetation,
        "confusion": {
            "truth_labels": [{"id": v, "name": TRUTH_NAMES.get(v, "?")} for v in t_labels],
            "predicted_labels": [{"id": v, "name": PREDICTED_NAMES.get(v, "?")} for v in p_labels],
            "counts": matrix.tolist(),
        },
        "taxonomy_mismatch": {
            # Named, not silently dropped. A label predicted that truth never
            # uses cannot be right, and a truth label never predicted cannot be
            # found -- both are findings, not noise in the matrix.
            "predicted_but_never_true": [
                {"id": v, "name": PREDICTED_NAMES.get(v, "?"), "count": int(np.sum(predicted == v))}
                for v in predicted_only
            ],
            "true_but_never_predicted": [
                {"id": v, "name": TRUTH_NAMES.get(v, "?"), "count": int(np.sum(truth == v))}
                for v in truth_only
            ],
        },
        "height_above_ground_m": {
            "max": round(float(hag.max()), 4),
            "p50": round(float(np.percentile(hag, 50)), 4),
            "p95": round(float(np.percentile(hag, 95)), 4),
            "p99": round(float(np.percentile(hag, 99)), 4),
            # The truth's own crop points, so an implausible canopy is visible
            # against what the simulator actually planted.
            "p95_of_true_crop": round(float(np.percentile(hag[truth == 5], 95)), 4)
            if np.any(truth == 5)
            else None,
            "max_of_true_crop": round(float(hag[truth == 5].max()), 4) if np.any(truth == 5) else None,
        },
    }

    text = json.dumps(report, indent=2)
    print(text)
    if args.out:
        args.out.write_text(text + "\n")
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
