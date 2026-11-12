"""
Fast tests for /liveness: face detection and FaceNet are replaced by fakes,
so this runs in a second without loading any model.

    cd ml_microservice
    python -m pytest tests/test_liveness.py -v
"""
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import liveness  # noqa: E402

app = FastAPI()
app.include_router(liveness.router)
client = TestClient(app)

# Each fake "image" is a text file: "<ratio> <person>", or "none" for no face.
@pytest.fixture(autouse=True)
def fake_models(monkeypatch):
    def read(path):
        return Path(path).read_text().split()

    def fake_ratio(path):
        parts = read(path)
        return (None, 0.0, None) if parts[0] == "none" else (float(parts[0]), 0.99, parts)

    def fake_embed(crop):
        if crop is None or crop[1] == "unreadable":
            return None
        return [1.0, 0.0] if crop[1] == "A" else [0.0, 1.0]

    monkeypatch.setattr(liveness, "turn_ratio", fake_ratio)
    monkeypatch.setattr(liveness, "embed_face", fake_embed)
    monkeypatch.setattr(liveness, "MIRRORED", False)


def post(centre, turns, challenge="turn_left"):
    files = [("centre", ("c.jpg", centre.encode()))]
    files += [("turns", (f"t{i}.jpg", t.encode())) for i, t in enumerate(turns)]
    r = client.post("/liveness", files=files,
                    data={"challenge": challenge, "min_turn_ratio": "0.25", "same_person_threshold": "1.25"})
    assert r.status_code == 200, r.text
    return r.json()


def test_genuine_left_turn_passes():
    r = post("0.02 A", ["0.20 A", "0.45 A"], "turn_left")
    assert r["passed"] is True and r["reason"] is None
    assert r["turn_ratio"] == pytest.approx(0.43)
    assert 0.5 <= r["liveness_score"] <= 1


def test_genuine_right_turn_passes():
    assert post("0.0 A", ["-0.4 A"], "turn_right")["passed"] is True


def test_turn_the_wrong_way_fails():
    r = post("0.0 A", ["-0.4 A", "-0.5 A"], "turn_left")
    assert r["passed"] is False and r["reason"] == "wrong_direction"


def test_static_photo_does_not_turn():
    r = post("0.03 A", ["0.04 A", "0.02 A"], "turn_left")
    assert r["passed"] is False and r["reason"] == "turn_too_small"


def test_different_person_in_turn_frames_fails():
    r = post("0.0 A", ["0.5 B"], "turn_left")
    assert r["passed"] is False and r["reason"] == "different_person"


def test_no_face_in_centre_frame():
    r = post("none", ["0.5 A"])
    assert r["passed"] is False and r["reason"] == "no_face_centre"


def test_no_face_in_turn_frames():
    r = post("0.0 A", ["none", "none"])
    assert r["passed"] is False and r["reason"] == "no_face_turn"


def test_one_good_frame_is_enough():
    assert post("0.0 A", ["none", "0.1 A", "0.3 A"])["passed"] is True


def test_mirrored_camera_flips_direction(monkeypatch):
    monkeypatch.setattr(liveness, "MIRRORED", True)
    assert post("0.0 A", ["-0.4 A"], "turn_left")["passed"] is True


def test_turn_face_found_but_not_embeddable_is_not_called_a_different_person():
    r = post("0.0 A", ["0.6 unreadable", "0.7 unreadable"], "turn_left")
    assert r["passed"] is False and r["reason"] == "turn_face_unreadable"


def test_bad_challenge_rejected():
    files = [("centre", ("c.jpg", b"0 A")), ("turns", ("t.jpg", b"0.5 A"))]
    r = client.post("/liveness", files=files, data={"challenge": "blink"})
    assert r.status_code == 422