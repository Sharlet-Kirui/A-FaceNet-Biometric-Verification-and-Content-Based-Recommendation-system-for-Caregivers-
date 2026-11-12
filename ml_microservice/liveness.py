"""
POST /liveness  - head-turn liveness check (issue #20).

Node sends the frames captured after a server-issued challenge:
    centre                   1 photo, looking straight at the camera
    turns                    1-3 photos taken while turning the head
    challenge                turn_left | turn_right   (random, chosen by Node)
    min_turn_ratio           system_settings.liveness_min_turn_ratio
    same_person_threshold    system_settings.liveness_same_person_threshold

How it decides
1. MTCNN finds the face and its five landmarks in every frame.
2. Turn ratio of a frame = (nose x - midpoint of the eyes x) / distance between the eyes.
   It is about 0 for a frontal face and grows as the head turns.
3. A turn frame counts when its ratio has moved from the centre frame's ratio
   by at least min_turn_ratio, in the requested direction.
4. That frame must show the same person as the centre frame
   (FaceNet euclidean_l2 distance below same_person_threshold).
Passed = at least one turn frame meets both 3 and 4.

A printed photo or a replayed video cannot follow a random direction issued a
few seconds earlier, which is what this check relies on (with the single-use
nonce Node enforces). It does not detect masks or deepfake video; that is a
stated limitation.

Direction: in an unmirrored photo, a person turning to THEIR left moves their
nose towards the RIGHT of the image. If your phone saves front-camera photos
mirrored, set LIVENESS_MIRRORED=true in .env (see the README calibration step).
"""
import os
import tempfile
from pathlib import Path
from typing import List

import cv2
import numpy as np
from deepface import DeepFace
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from verification import MAX_UPLOAD_BYTES, MODEL_NAME, euclidean_l2

router = APIRouter()

MIRRORED = os.getenv("LIVENESS_MIRRORED", "false").strip().lower() in ("1", "true", "yes")
DETECT_MAX_SIDE = 800  # MTCNN is slow on full-size photos; landmarks need far less

_detector = None


def _mtcnn():
    """Loaded on first use (the same mtcnn package DeepFace uses for its mtcnn backend)."""
    global _detector
    if _detector is None:
        from mtcnn import MTCNN
        _detector = MTCNN()
    return _detector


def turn_ratio(path: str):
    """Returns (ratio, confidence, face crop) for the largest face, or (None, 0.0, None) if none.

    The crop (face box plus a margin, from the full-size photo) is what FaceNet
    embeds. DeepFace's own detector is not run again on it: it often rejects a
    turned face that MTCNN has just found, which would hide the same-person result.
    """
    img = cv2.imread(path)  # applies EXIF orientation
    if img is None:
        raise HTTPException(status_code=422, detail=f"Could not read image: {os.path.basename(path)}")
    scale = min(1.0, DETECT_MAX_SIDE / max(img.shape[:2]))
    small = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1.0 else img
    faces = _mtcnn().detect_faces(cv2.cvtColor(small, cv2.COLOR_BGR2RGB))
    if not faces:
        return None, 0.0, None
    face = max(faces, key=lambda f: f["box"][2] * f["box"][3])
    k = face["keypoints"]
    (lx, ly), (rx, ry), (nx, _) = k["left_eye"], k["right_eye"], k["nose"]
    eye_dist = float(np.hypot(rx - lx, ry - ly))
    if eye_dist < 1:
        return None, 0.0, None

    x, y, w, h = (v / scale for v in face["box"])
    m = 0.2 * max(w, h)
    x0, y0 = int(max(0, x - m)), int(max(0, y - m))
    x1, y1 = int(min(img.shape[1], x + w + m)), int(min(img.shape[0], y + h + m))
    crop = img[y0:y1, x0:x1]
    return float((nx - (lx + rx) / 2) / eye_dist), float(face["confidence"]), crop


def embed_face(crop):
    """FaceNet embedding of an already-cropped face, or None."""
    if crop is None or crop.size == 0:
        return None
    try:
        reps = DeepFace.represent(img_path=crop, model_name=MODEL_NAME,
                                  detector_backend="skip", enforce_detection=False)
        return reps[0]["embedding"]
    except Exception:
        return None


def expected_sign(challenge: str) -> int:
    """+1 if the ratio should increase for this challenge, -1 if it should decrease."""
    sign = 1 if challenge == "turn_left" else -1
    return -sign if MIRRORED else sign


def liveness_score(best_delta: float, min_turn_ratio: float) -> float:
    """0-1, with the minimum turn at exactly 0.5 (same idea as the face score)."""
    return float(min(1.0, max(0.0, best_delta / (2 * min_turn_ratio))))


@router.post("/liveness")
async def liveness(
    centre: UploadFile = File(..., description="Frontal frame"),
    turns: List[UploadFile] = File(..., description="1-3 frames taken while turning"),
    challenge: str = Form(..., description="turn_left | turn_right"),
    min_turn_ratio: float = Form(0.25),
    same_person_threshold: float = Form(1.25),
):
    if challenge not in ("turn_left", "turn_right"):
        raise HTTPException(status_code=422, detail="challenge must be turn_left or turn_right")
    if not 1 <= len(turns) <= 3:
        raise HTTPException(status_code=422, detail="Send 1 to 3 turn frames")

    sign = expected_sign(challenge)
    with tempfile.TemporaryDirectory() as tmp:
        paths = []
        for i, upload in enumerate([centre, *turns]):
            data = await upload.read()
            if len(data) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Frame larger than 5 MB")
            p = os.path.join(tmp, f"{i}{Path(upload.filename or 'f.jpg').suffix or '.jpg'}")
            Path(p).write_bytes(data)
            paths.append(p)

        c_ratio, _, c_crop = turn_ratio(paths[0])
        c_emb = embed_face(c_crop) if c_ratio is not None else None
        result = {
            "challenge": challenge,
            "mirrored": MIRRORED,
            "min_turn_ratio": min_turn_ratio,
            "same_person_threshold": same_person_threshold,
            "centre_ratio": None if c_ratio is None else round(c_ratio, 3),
        }
        if c_emb is None:
            return {**result, "passed": False, "liveness_score": 0.0, "turn_ratio": None,
                    "reason": "no_face_centre", "frames": []}

        frames = []
        for i, p in enumerate(paths[1:], start=1):
            ratio, _, crop = turn_ratio(p)
            frame = {"index": i, "face": ratio is not None}
            if ratio is not None:
                delta = float((ratio - c_ratio) * sign)  # positive = moved the requested way
                emb = embed_face(crop)
                dist = euclidean_l2(c_emb, emb) if emb is not None else None
                frame.update({
                    "ratio": round(ratio, 3),
                    "delta": round(delta, 3),
                    "distance_to_centre": None if dist is None else round(dist, 4),
                    "same_person": bool(dist is not None and dist < same_person_threshold),
                    "turned_enough": bool(delta >= min_turn_ratio),
                })
            frames.append(frame)

    detected = [f for f in frames if f["face"]]
    good = [f for f in detected if f["same_person"] and f["turned_enough"]]
    best = max((f["delta"] for f in (good or detected)), default=None)

    if good:
        reason = None
    elif not detected:
        reason = "no_face_turn"
    elif all(f["distance_to_centre"] is None for f in detected):
        reason = "turn_face_unreadable"
    elif not any(f["same_person"] for f in detected):
        reason = "different_person"
    elif all(f["delta"] <= -min_turn_ratio for f in detected):
        reason = "wrong_direction"
    else:
        reason = "turn_too_small"

    # one line per check in the uvicorn terminal, for calibration
    print(f"[liveness] {challenge} centre={result['centre_ratio']} "
          f"frames={[(f.get('delta'), f.get('distance_to_centre')) for f in frames]} "
          f"passed={bool(good)} reason={reason}", flush=True)

    return {
        **result,
        "passed": bool(good),
        "liveness_score": round(liveness_score(best, min_turn_ratio), 3) if good else 0.0,
        "turn_ratio": None if best is None else round(best, 3),
        "reason": reason,
        "frames": frames,
    }