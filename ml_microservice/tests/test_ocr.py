"""
Tests for /ocr.

    cd ml_microservice
    python -m pytest tests/test_ocr.py -v

The comparison tests need nothing installed. The endpoint tests draw a fake ID
card and need Tesseract; they are skipped if it is not installed.
"""
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ocr  # noqa: E402

CARD_TEXT = """JAMHURI YA KENYA REPUBLIC OF KENYA
SERIAL NUMBER: 234567891
ID NUMBER: 30123456
FULL NAMES
GRACE WANJIKU KAMAU
DATE OF BIRTH 12.03.1994"""


# --------------------------------------------------------------- comparison only
def test_exact_details_score_1():
    r = ocr.score_text(CARD_TEXT, "national_id", "30123456", "Grace", "Wanjiku")
    assert r["ocr_score"] == 1.0 and r["id_number"]["found"] == "30123456"


def test_serial_number_is_not_mistaken_for_the_id_number():
    r = ocr.score_text(CARD_TEXT, "national_id", "30123456", "Grace", "Wanjiku")
    assert r["id_number"]["found"] != "234567891"


def test_one_misread_digit_gives_partial_credit():
    text = CARD_TEXT.replace("30123456", "30I23456")  # 1 read as I is fixed
    assert ocr.score_text(text, "national_id", "30123456", "Grace", "Wanjiku")["id_number"]["score"] == 1.0
    text = CARD_TEXT.replace("30123456", "30123458")
    assert ocr.score_text(text, "national_id", "30123456", "Grace", "Wanjiku")["id_number"]["score"] == 0.875


def test_wrong_number_scores_low():
    r = ocr.score_text(CARD_TEXT, "national_id", "29999999", "Grace", "Wanjiku")
    assert r["id_number"]["score"] < 0.3


def test_someone_elses_name_scores_0_for_names():
    r = ocr.score_text(CARD_TEXT, "national_id", "30123456", "Mary", "Achieng")
    assert r["names"]["score"] == 0.0 and r["ocr_score"] == 0.5


def test_small_name_misread_still_counts():
    r = ocr.score_text(CARD_TEXT.replace("WANJIKU", "WANJTKU"), "national_id", "30123456", "Grace", "Wanjiku")
    assert r["names"]["score"] > 0.6


def test_no_text_scores_0():
    r = ocr.score_text("  \n ", "national_id", "30123456", "Grace", "Wanjiku")
    assert r["ocr_score"] == 0.0 and r["reason"] == "no_text"


def test_passport_number_with_letters():
    text = "PASSPORT REPUBLIC OF KENYA\nPassport No AK0123456\nWANJIKU GRACE"
    assert ocr.score_text(text, "passport", "AK0123456", "Grace", "Wanjiku")["ocr_score"] == 1.0


# --------------------------------------------------------------- endpoint
needs_tesseract = pytest.mark.skipif(not ocr.tesseract_available(), reason="Tesseract not installed")


def fake_card(path, lines):
    img = np.full((630, 1000, 3), (205, 226, 214), np.uint8)
    for i, line in enumerate(lines):
        cv2.putText(img, line, (40, 70 + i * 70), cv2.FONT_HERSHEY_DUPLEX, 1.2, (20, 20, 20), 2, cv2.LINE_AA)
    cv2.imwrite(str(path), img)


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(ocr.router)
    return TestClient(app)


def post(client, path, number="30123456", first="Grace", last="Wanjiku"):
    r = client.post("/ocr", files={"id_image": ("id.jpg", Path(path).read_bytes())},
                    data={"id_type": "national_id", "id_number": number, "first_name": first, "last_name": last})
    assert r.status_code == 200, r.text
    return r.json()


@needs_tesseract
def test_endpoint_reads_a_card_and_masks_the_number(client, tmp_path):
    card = tmp_path / "card.jpg"
    fake_card(card, ["REPUBLIC OF KENYA", "SERIAL NUMBER 234567891", "ID NUMBER 30123456",
                     "FULL NAMES", "GRACE WANJIKU KAMAU"])
    r = post(client, card)
    assert r["ran"] is True and r["ocr_score"] >= 0.9
    assert r["id_number"]["found"] == "*****456"


@needs_tesseract
def test_endpoint_face_photo_instead_of_id_scores_0(client, tmp_path):
    photo = tmp_path / "face.jpg"
    cv2.imwrite(str(photo), np.full((600, 800, 3), 120, np.uint8))
    assert post(client, photo)["ocr_score"] == 0.0


def test_endpoint_without_tesseract_says_not_run(client, tmp_path, monkeypatch):
    monkeypatch.setattr(ocr, "tesseract_available", lambda: False)
    card = tmp_path / "card.jpg"
    fake_card(card, ["ID NUMBER 30123456"])
    assert post(client, card) == {"ran": False, "reason": "tesseract_not_installed"}
