"""
Verification endpoints for the ML microservice.

    POST /verify        ID photo + selfie -> detection, blur, embeddings, distance, face score
    POST /iprs/lookup   typed identity details -> mock IPRS status (verified | mismatch | unavailable)

Add to main.py:

    from verification import router as verification_router
    app.include_router(verification_router)

Uses the same pipeline as evaluate_matching.py (Facenet + MTCNN, euclidean_l2), so
the threshold you measured on LFW (1.0958) applies directly. Node passes the
threshold from system_settings; FACE_DISTANCE_THRESHOLD in .env is the fallback.
"""
import json
import os
import tempfile
import unicodedata
from pathlib import Path

import cv2
import numpy as np
from deepface import DeepFace
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

router = APIRouter()

MODEL_NAME = "Facenet"
DETECTOR = "mtcnn"
DEFAULT_THRESHOLD = float(os.getenv("FACE_DISTANCE_THRESHOLD", "1.0958"))
BLUR_THRESHOLD = float(os.getenv("BLUR_THRESHOLD", "100"))
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MOCK_IPRS_PATH = Path(os.getenv("MOCK_IPRS_PATH", Path(__file__).with_name("mock_iprs.json")))


# --------------------------------------------------------------------------- helpers
def _save_upload(upload: UploadFile, data: bytes, folder: str) -> str:
    suffix = Path(upload.filename or "image.jpg").suffix or ".jpg"
    path = os.path.join(folder, f"{os.urandom(8).hex()}{suffix}")
    with open(path, "wb") as f:
        f.write(data)
    return path


def blur_variance(path: str) -> float:
    """Laplacian variance, same measure as clean_lfw_dataset.py (higher = sharper)."""
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise HTTPException(status_code=422, detail=f"Could not read image: {os.path.basename(path)}")
    return float(cv2.Laplacian(img, cv2.CV_64F).var())


def embed(path: str):
    """Returns (embedding list, detection confidence) or (None, 0.0) if no face is found."""
    try:
        reps = DeepFace.represent(
            img_path=path, model_name=MODEL_NAME, detector_backend=DETECTOR, enforce_detection=True
        )
    except ValueError:  # DeepFace raises ValueError when no face is detected
        return None, 0.0
    best = max(reps, key=lambda r: r.get("face_confidence", 0) or 0)  # largest/most confident face
    return best["embedding"], float(best.get("face_confidence", 0) or 0)


def euclidean_l2(a, b) -> float:
    """Distance between L2-normalised embeddings (DeepFace's euclidean_l2)."""
    a, b = np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)
    a, b = a / np.linalg.norm(a), b / np.linalg.norm(b)
    return float(np.linalg.norm(a - b))


def face_score(distance: float, threshold: float) -> float:
    """Maps distance to 0-1 with the threshold at exactly 0.5 (same as api_backend trustScore.js)."""
    return float(min(1.0, max(0.0, 1 - distance / (2 * threshold))))


# --------------------------------------------------------------------------- /verify
@router.post("/verify")
async def verify(
    id_image: UploadFile = File(..., description="Photo of the ID / passport photo page"),
    selfie: UploadFile = File(..., description="Centre frame of the liveness capture"),
    threshold: float = Form(DEFAULT_THRESHOLD),
):
    with tempfile.TemporaryDirectory() as tmp:
        paths = {}
        for name, upload in (("id", id_image), ("selfie", selfie)):
            data = await upload.read()
            if len(data) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail=f"{name} image is larger than 5 MB")
            paths[name] = _save_upload(upload, data, tmp)

        blur = {k: round(blur_variance(p), 2) for k, p in paths.items()}
        id_emb, id_conf = embed(paths["id"])
        sf_emb, sf_conf = embed(paths["selfie"])

    detected = {"id": id_emb is not None, "selfie": sf_emb is not None}
    distance = euclidean_l2(id_emb, sf_emb) if all(detected.values()) else None

    return {
        "model": MODEL_NAME,
        "detector": DETECTOR,
        "distance_metric": "euclidean_l2",
        "threshold": threshold,
        "face_detected": detected,
        "detection_confidence": {"id": round(id_conf, 4), "selfie": round(sf_conf, 4)},
        "blur_variance": blur,
        "blur_ok": {k: v >= BLUR_THRESHOLD for k, v in blur.items()},
        "distance": round(distance, 4) if distance is not None else None,
        "match": distance is not None and distance < threshold,
        "face_score": round(face_score(distance, threshold), 3) if distance is not None else 0.0,
        # 128-d vectors for the face_embeddings table (source = id_document | selfie)
        "embeddings": {"id_document": id_emb, "selfie": sf_emb},
    }


# --------------------------------------------------------------------------- mock IPRS
class IprsRequest(BaseModel):
    id_type: str            # national_id | passport
    id_number: str
    first_name: str
    last_name: str
    date_of_birth: str      # YYYY-MM-DD


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return " ".join(s.lower().split())


@router.post("/iprs/lookup")
def iprs_lookup(req: IprsRequest):
    """
    Mock of the government IPRS check. Real IPRS access needs an agreement with the
    Ministry, so this reads fictional records from mock_iprs.json.
      verified    - the ID exists and the name and date of birth match
      mismatch    - the ID does not exist, or the details differ
      unavailable - the registry could not be read (the trust decision sends this to review)
    """
    try:
        records = json.loads(MOCK_IPRS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"status": "unavailable", "reason": "registry_unreachable"}

    rec = next((r for r in records
                if r["id_type"] == req.id_type and r["id_number"].strip().upper() == req.id_number.strip().upper()), None)
    if rec is None:
        return {"status": "mismatch", "reason": "id_not_found"}

    diffs = [field for field in ("first_name", "last_name")
             if _norm(rec[field]) != _norm(getattr(req, field))]
    if rec["date_of_birth"] != req.date_of_birth:
        diffs.append("date_of_birth")
    if diffs:
        return {"status": "mismatch", "reason": "details_differ", "fields": diffs}
    return {"status": "verified"}
