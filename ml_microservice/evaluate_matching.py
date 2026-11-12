"""
LFW face-verification evaluation for the DeepFace pipeline (Facenet + MTCNN, euclidean_l2).

Metrics (proposal 3.2.4):
  * EER  - equal error rate: the point where FAR = FRR (biometric "crossover error rate").
           Called EER here so it is not confused with OCR's CER (character error rate).
  * TAR and FAR at the EER threshold
  * TAR at FAR = 1%
  * ROC curve (saved as roc_curve.png) and AUC
  * Accuracy at DeepFace's default threshold and at the EER threshold
  * 10-fold cross-validation (LFW protocol style): the threshold is chosen at the EER on
    9 folds and accuracy / TAR / FAR are measured on the held-out fold, so the reported
    operating-point results never use pairs that chose the threshold (mean +- std over folds)

FAR = false accepts / all impostor pairs, FRR = false rejects / all genuine pairs.
(Each rate is divided by its own class size, not by the total number of pairs.)

Usage (inside ml_microservice with the venv active):
    python evaluate_matching.py              # runs DeepFace on every pair, saves pair_distances.csv
    python evaluate_matching.py --from-csv   # recomputes metrics from pair_distances.csv in seconds
"""
import argparse
import os
import sys

import numpy as np
import pandas as pd
from sklearn.metrics import auc, roc_curve
from sklearn.model_selection import StratifiedKFold

# --- CONFIG: adjust these paths to match your machine ---
LFW_ROOT = r"C:\Users\sharl\datasets\lfw\lfw-deepfunneled\lfw-deepfunneled"
CSV_DIR = r"C:\Users\sharl\datasets\lfw"
MATCH_CSV = "clean_matchpairsDevTest.csv"
MISMATCH_CSV = "clean_mismatchpairsDevTest.csv"

MODEL_NAME = "Facenet"
DETECTOR = "mtcnn"
METRIC = "euclidean_l2"
DISTANCES_CSV = "pair_distances.csv"
RESULTS_TXT = "evaluation_results.txt"
ROC_PNG = "roc_curve.png"
N_FOLDS = 10
SEED = 42


def image_path(name: str, imagenum: int) -> str:
    return os.path.join(LFW_ROOT, name, f"{name}_{int(imagenum):04d}.jpg")


def load_pairs():
    matched = pd.read_csv(os.path.join(CSV_DIR, MATCH_CSV))
    mismatched = pd.read_csv(os.path.join(CSV_DIR, MISMATCH_CSV))
    pairs = [(image_path(r["name"], r["imagenum1"]), image_path(r["name"], r["imagenum2"]), 1)
             for _, r in matched.iterrows()]
    pairs += [(image_path(r["name"], r["imagenum1"]), image_path(r["name.1"], r["imagenum2"]), 0)
              for _, r in mismatched.iterrows()]
    return pairs


def run_deepface():
    from deepface import DeepFace  # imported here so --from-csv works without TensorFlow

    pairs = load_pairs()
    n_match = sum(p[2] for p in pairs)
    print(f"Loaded {len(pairs)} pairs ({n_match} genuine, {len(pairs) - n_match} impostor)")

    rows, skipped = [], 0
    for i, (img1, img2, label) in enumerate(pairs):
        if not (os.path.exists(img1) and os.path.exists(img2)):
            skipped += 1
            continue
        try:
            r = DeepFace.verify(img1_path=img1, img2_path=img2, model_name=MODEL_NAME,
                                detector_backend=DETECTOR, distance_metric=METRIC, enforce_detection=True)
            rows.append({"img1": img1, "img2": img2, "label": label,
                         "distance": r["distance"], "deepface_verified": int(r["verified"]),
                         "deepface_threshold": r["threshold"]})
        except Exception as e:  # no face detected, unreadable image, etc.
            skipped += 1
            print(f"  skipped pair {i}: {type(e).__name__}: {e}")
        if (i + 1) % 50 == 0:
            print(f"  processed {i + 1}/{len(pairs)}")

    df = pd.DataFrame(rows)
    df.attrs["skipped"] = skipped
    df.to_csv(DISTANCES_CSV, index=False)
    with open(DISTANCES_CSV + ".skipped", "w") as f:
        f.write(str(skipped))
    print(f"Saved {len(df)} pair distances to {DISTANCES_CSV} (skipped {skipped})")
    return df, skipped


def eer_point(y, d):
    """Returns (eer, threshold) where FAR = FRR, each rate over its own class."""
    fpr, tpr, thr = roc_curve(y, -d)
    fnr = 1 - tpr
    i = int(np.nanargmin(np.abs(fnr - fpr)))
    return float((fpr[i] + fnr[i]) / 2), float(-thr[i])


def rates(y, d, threshold):
    pred = (d <= threshold).astype(int)
    return (float(np.mean(pred == y)), float(np.mean(pred[y == 1] == 1)), float(np.mean(pred[y == 0] == 1)))


def cross_validate(y, d, k=N_FOLDS, seed=SEED):
    """Threshold from k-1 folds, accuracy/TAR/FAR on the held-out fold."""
    folds = StratifiedKFold(n_splits=k, shuffle=True, random_state=seed)
    acc, tar, far, thr = [], [], [], []
    for train, test in folds.split(d.reshape(-1, 1), y):
        _, t = eer_point(y[train], d[train])
        a, ta, fa = rates(y[test], d[test], t)
        acc.append(a); tar.append(ta); far.append(fa); thr.append(t)
    ms = lambda v: (float(np.mean(v)), float(np.std(v)))
    return {"k": k, "accuracy": ms(acc), "tar": ms(tar), "far": ms(far), "threshold": ms(thr)}


def compute_metrics(df: pd.DataFrame):
    if df.empty or df["label"].nunique() < 2:
        sys.exit("Need both genuine and impostor pairs to compute metrics.")
    y = df["label"].to_numpy()
    d = df["distance"].to_numpy()

    # Lower distance = more likely the same person, so use -distance as the score.
    fpr, tpr, thr = roc_curve(y, -d)
    fnr = 1 - tpr
    i = int(np.nanargmin(np.abs(fnr - fpr)))
    eer = float((fpr[i] + fnr[i]) / 2)
    eer_threshold = float(-thr[i])

    pred_eer = (d <= eer_threshold).astype(int)
    tar_at_eer = float(np.mean(pred_eer[y == 1] == 1))
    far_at_eer = float(np.mean(pred_eer[y == 0] == 1))
    acc_eer = float(np.mean(pred_eer == y))

    ok = fpr <= 0.01
    tar_at_far1 = float(tpr[ok].max()) if ok.any() else 0.0

    acc_default = float(np.mean(df["deepface_verified"].to_numpy() == y)) if "deepface_verified" in df else None
    default_thr = float(df["deepface_threshold"].iloc[0]) if "deepface_threshold" in df else None

    cv = cross_validate(y, d)

    return {
        "cv": cv,
        "pairs": len(df), "genuine": int((y == 1).sum()), "impostor": int((y == 0).sum()),
        "auc": float(auc(fpr, tpr)), "eer": eer, "eer_threshold": eer_threshold,
        "tar_at_eer": tar_at_eer, "far_at_eer": far_at_eer, "accuracy_at_eer": acc_eer,
        "tar_at_far_1pct": tar_at_far1, "accuracy_default": acc_default, "default_threshold": default_thr,
        "_roc": (fpr, tpr),
    }


def save_outputs(m, skipped):
    lines = [
        f"Model: {MODEL_NAME} | detector: {DETECTOR} | metric: {METRIC}",
        f"Pairs evaluated: {m['pairs']} ({m['genuine']} genuine, {m['impostor']} impostor), skipped: {skipped}",
        f"AUC: {m['auc']:.4f}",
        f"EER: {m['eer']:.4f} at distance threshold {m['eer_threshold']:.4f}",
        f"At EER threshold -> TAR: {m['tar_at_eer']:.4f}, FAR: {m['far_at_eer']:.4f}, accuracy: {m['accuracy_at_eer']:.4f}",
        f"TAR at FAR = 1%: {m['tar_at_far_1pct']:.4f}",
        "",
        f"{m['cv']['k']}-fold cross-validation (threshold chosen on {m['cv']['k'] - 1} folds, measured on the held-out fold):",
        f"  accuracy: {m['cv']['accuracy'][0]:.4f} +- {m['cv']['accuracy'][1]:.4f}",
        f"  TAR:      {m['cv']['tar'][0]:.4f} +- {m['cv']['tar'][1]:.4f}",
        f"  FAR:      {m['cv']['far'][0]:.4f} +- {m['cv']['far'][1]:.4f}",
        f"  threshold:{m['cv']['threshold'][0]:.4f} +- {m['cv']['threshold'][1]:.4f}",
        "",
        f"Deployment threshold (EER on all pairs, copy to system_settings.face_distance_threshold): {m['eer_threshold']:.4f}",
    ]
    if m["accuracy_default"] is not None:
        lines.append(f"Accuracy at DeepFace default threshold ({m['default_threshold']:.4f}): {m['accuracy_default']:.4f}")
    text = "\n".join(lines)
    print("\n" + text)
    with open(RESULTS_TXT, "w") as f:
        f.write(text + "\n")
    print(f"\nResults written to {RESULTS_TXT}")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fpr, tpr = m["_roc"]
        plt.figure(figsize=(5, 5))
        plt.plot(fpr, tpr, label=f"Facenet + MTCNN (AUC = {m['auc']:.3f})")
        plt.plot([0, 1], [0, 1], linestyle="--", linewidth=1, label="Chance")
        plt.scatter([m["far_at_eer"]], [m["tar_at_eer"]], zorder=3, label=f"EER = {m['eer']:.3f}")
        plt.xlabel("False Accept Rate (FAR)")
        plt.ylabel("True Accept Rate (TAR)")
        plt.title("ROC - LFW verification")
        plt.legend(loc="lower right")
        plt.tight_layout()
        plt.savefig(ROC_PNG, dpi=200)
        print(f"ROC curve saved to {ROC_PNG}")
    except ImportError:
        print("matplotlib not installed - skipping ROC plot (pip install matplotlib)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-csv", action="store_true", help=f"recompute metrics from {DISTANCES_CSV}")
    args = ap.parse_args()

    if args.from_csv:
        df = pd.read_csv(DISTANCES_CSV)
        skipped = int(open(DISTANCES_CSV + ".skipped").read()) if os.path.exists(DISTANCES_CSV + ".skipped") else 0
    else:
        df, skipped = run_deepface()
    save_outputs(compute_metrics(df), skipped)