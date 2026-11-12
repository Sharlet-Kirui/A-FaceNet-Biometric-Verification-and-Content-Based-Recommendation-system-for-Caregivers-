"""
POST /ocr  - reads the front of the ID and compares it with the typed details (FR-14).

Node sends:
    id_image     photo of the national ID front (or passport photo page)
    id_type      national_id | passport
    id_number    number the caregiver typed
    first_name   typed first name
    last_name    typed last name

Returns:
    ran           false only if Tesseract is not installed (Node then leaves OCR
                  out of the trust score, as before)
    ocr_score     0-1 = 0.5 x ID number agreement + 0.5 x name agreement
    id_number     {found, score}   best match among the numbers read (masked to the last 3)
    names         {found, score}   typed name parts found on the card
    reason        no_text | null

How it reads the card
1. The photo is converted to grey, enlarged so text is about 30 px high, and
   read twice by Tesseract: once as it is and once after Otsu thresholding.
   The text from both reads is combined.
2. ID number: every run of 6-10 letters/digits is a candidate (an old ID shows
   both a serial number and an ID number). The candidate closest to the typed
   number decides the score: 1 for an exact match, otherwise 1 - edit distance / length.
3. Names: each typed name part is compared with every word read; the best
   similarity per part (below 0.6 = 0, 0.9 or more = 1) is averaged. Card layouts differ (old ID, Maisha card,
   passport), so no field positions are assumed.

A photo with no readable text scores 0, not "not run": OCR is the only check that
the ID image is a document at all, rather than a face photo uploaded as an ID.

Install Tesseract on Windows from https://github.com/UB-Mannheim/tesseract/wiki
and, if it is not on PATH, set TESSERACT_CMD in .env, e.g.
    TESSERACT_CMD=C:\\Program Files\\Tesseract-OCR\\tesseract.exe
"""
import os
import re
import tempfile
from difflib import SequenceMatcher
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

router = APIRouter()

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
TARGET_WIDTH = 1800  # pixels; an ID card photo this wide gives Tesseract readable text
TESSERACT_CONFIG = "--oem 3 --psm 11"  # psm 11: sparse text, suits cards with scattered fields

try:
    import pytesseract
    if os.getenv("TESSERACT_CMD"):
        pytesseract.pytesseract.tesseract_cmd = os.getenv("TESSERACT_CMD")
except ImportError:  # pragma: no cover
    pytesseract = None


# --------------------------------------------------------------------------- reading
def tesseract_available() -> bool:
    if pytesseract is None:
        return False
    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def preprocess(path: str):
    """Returns the two images Tesseract reads: enlarged grey, and Otsu black-and-white."""
    img = cv2.imread(path)  # applies EXIF orientation
    if img is None:
        raise HTTPException(status_code=422, detail="Could not read the ID image")
    grey = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    scale = TARGET_WIDTH / grey.shape[1]
    if scale > 1.05 or scale < 0.95:
        grey = cv2.resize(grey, None, fx=scale, fy=scale,
                          interpolation=cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA)
    grey = cv2.fastNlMeansDenoising(grey, None, 10)
    _, bw = cv2.threshold(grey, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return [grey, bw]


def read_text(path: str) -> str:
    return "\n".join(pytesseract.image_to_string(im, config=TESSERACT_CONFIG) for im in preprocess(path))


# --------------------------------------------------------------------------- comparing
def _clean_number(s: str) -> str:
    """Upper-case letters and digits only; common OCR swaps inside numbers fixed."""
    s = re.sub(r"[^A-Za-z0-9]", "", s or "").upper()
    return s


def _digits_fixed(s: str) -> str:
    return s.translate(str.maketrans({"O": "0", "D": "0", "Q": "0", "I": "1", "L": "1",
                                      "Z": "2", "S": "5", "B": "8", "G": "6"}))


def levenshtein(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def number_candidates(text: str, id_type: str):
    tokens = re.findall(r"[A-Za-z0-9]{6,10}", text)
    out = []
    for t in tokens:
        t = _clean_number(t)
        if id_type == "national_id":
            t = _digits_fixed(t)
            if not t.isdigit():
                continue
        elif not any(ch.isdigit() for ch in t):
            continue  # a passport number has digits; skip plain words
        out.append(t)
    return list(dict.fromkeys(out))  # unique, in reading order


def number_agreement(typed: str, candidates):
    typed = _clean_number(typed)
    if not typed or not candidates:
        return None, 0.0
    best = min(candidates, key=lambda c: levenshtein(typed, c))
    score = max(0.0, 1 - levenshtein(typed, best) / len(typed))
    return best, round(score, 3)


def name_agreement(first: str, last: str, text: str):
    words = [w for w in re.findall(r"[A-Za-z']{2,}", text.upper())]
    parts = [p for p in re.findall(r"[A-Za-z']{2,}", f"{first} {last}".upper())]
    if not parts:
        return [], 0.0
    if not words:
        return [], 0.0
    found, scores = [], []
    for p in parts:
        w, s = max(((w, SequenceMatcher(None, p, w).ratio()) for w in words), key=lambda x: x[1])
        # Unrelated words are often 40-60% similar by chance, so similarity below
        # 0.6 counts as 0, 0.9 and above as 1 (one or two misread letters), linear between.
        scores.append(min(1.0, max(0.0, (s - 0.6) / 0.3)))
        if s >= 0.8:
            found.append(w)
    return found, round(float(np.mean(scores)), 3)


def score_text(text: str, id_type: str, id_number: str, first_name: str, last_name: str) -> dict:
    """Pure comparison step, separate from Tesseract so it can be tested and reused by ml_eval."""
    if not re.search(r"[A-Za-z0-9]{3,}", text or ""):
        return {"ocr_score": 0.0, "id_number": {"found": None, "score": 0.0},
                "names": {"found": [], "score": 0.0}, "reason": "no_text"}
    num_found, num_score = number_agreement(id_number, number_candidates(text, id_type))
    names_found, name_score = name_agreement(first_name, last_name, text)
    return {
        "ocr_score": round(0.5 * num_score + 0.5 * name_score, 3),
        "id_number": {"found": num_found, "score": num_score},
        "names": {"found": names_found, "score": name_score},
        "reason": None,
    }


# --------------------------------------------------------------------------- endpoint
@router.post("/ocr")
async def ocr(
    id_image: UploadFile = File(..., description="Front of the national ID or passport photo page"),
    id_type: str = Form("national_id"),
    id_number: str = Form(...),
    first_name: str = Form(""),
    last_name: str = Form(""),
):
    if id_type not in ("national_id", "passport"):
        raise HTTPException(status_code=422, detail="id_type must be national_id or passport")
    if not tesseract_available():
        return {"ran": False, "reason": "tesseract_not_installed"}

    data = await id_image.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="ID image larger than 5 MB")
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "id" + (Path(id_image.filename or "id.jpg").suffix or ".jpg"))
        Path(path).write_bytes(data)
        text = read_text(path)

    result = score_text(text, id_type, id_number, first_name, last_name)
    # The report is stored unencrypted, so only the last 3 characters of the number read are returned
    found = result["id_number"]["found"]
    result["id_number"]["found"] = None if not found else "*" * (len(found) - 3) + found[-3:]
    # Never log the typed or read ID number: it is personal data (Data Protection Act 2019)
    print(f"[ocr] {id_type} score={result['ocr_score']} number={result['id_number']['score']} "
          f"names={result['names']['score']} reason={result['reason']}", flush=True)
    return {"ran": True, **result}
