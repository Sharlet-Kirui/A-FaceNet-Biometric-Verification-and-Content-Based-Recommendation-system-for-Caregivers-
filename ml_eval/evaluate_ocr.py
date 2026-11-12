"""
OCR evaluation for Chapter 5 (proposal: CER and field precision/recall for name and ID number).

Input: a CSV you fill in by hand from your consenting volunteers' IDs
    image,id_type,id_number,first_name,last_name
    ocr_data/p01_front.jpg,national_id,12345678,Grace,Wanjiku
Paths are relative to the CSV. Keep the photos and the CSV in ml_eval/ocr_data/,
which is git-ignored: they are real identity documents.

Run from ml_microservice (same venv and Tesseract as the service):
    python ../ml_eval/evaluate_ocr.py ../ml_eval/ocr_data/labels.csv

For each card it reads the text once with the same code as POST /ocr, then reports
  - CER of the ID number and of each name part: edit distance between the true value
    and the closest value read, divided by the true length (0 = read perfectly)
  - field precision and recall:
      a field is "extracted" if something close to it was read (score >= 0.8);
      it is "correct" if it was read exactly (CER 0)
      precision = correct / extracted, recall = correct / all cards
  - ocr_score for the genuine details and for another volunteer's details
    (impostor), to show the score separates the right person from the wrong one.

Writes ocr_results.csv next to the labels with ID numbers masked.
"""
import csv
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))
import ocr  # noqa: E402  (ml_microservice/ocr.py)


def cer(truth: str, read: str) -> float:
    truth = truth.upper()
    if not read:
        return 1.0
    return min(1.0, ocr.levenshtein(truth, read.upper()) / len(truth))


def best_word(part: str, text: str) -> str:
    import re
    from difflib import SequenceMatcher
    words = re.findall(r"[A-Za-z']{2,}", text.upper())
    return max(words, key=lambda w: SequenceMatcher(None, part.upper(), w).ratio()) if words else ""


def mask(n: str) -> str:
    return "*" * max(0, len(n) - 3) + n[-3:]


def main(labels_csv: str):
    labels = Path(labels_csv)
    rows = list(csv.DictReader(labels.open(encoding="utf-8")))
    if len(rows) < 2:
        sys.exit("Need at least 2 cards (the impostor test uses another volunteer's details).")
    if not ocr.tesseract_available():
        sys.exit("Tesseract not found. Install it or set TESSERACT_CMD.")

    out, n_cer, name_cers = [], [], []
    num = {"extracted": 0, "correct": 0}
    name = {"extracted": 0, "correct": 0, "total": 0}
    genuine, impostor = [], []

    for i, r in enumerate(rows):
        text = ocr.read_text(str(labels.parent / r["image"]))
        cands = ocr.number_candidates(text, r["id_type"])
        read_num, num_score = ocr.number_agreement(r["id_number"], cands)
        c = cer(ocr._clean_number(r["id_number"]), read_num or "")
        n_cer.append(c)
        num["extracted"] += num_score >= 0.8
        num["correct"] += c == 0

        parts = [p for p in f"{r['first_name']} {r['last_name']}".split() if p]
        part_cers = []
        for p in parts:
            pc = cer(p, best_word(p, text))
            part_cers.append(pc)
            name["total"] += 1
            name["extracted"] += pc <= 0.2
            name["correct"] += pc == 0
        name_cers.extend(part_cers)

        g = ocr.score_text(text, r["id_type"], r["id_number"], r["first_name"], r["last_name"])["ocr_score"]
        other = rows[(i + 1) % len(rows)]  # someone else's details against this card
        imp = ocr.score_text(text, r["id_type"], other["id_number"], other["first_name"], other["last_name"])["ocr_score"]
        genuine.append(g)
        impostor.append(imp)
        out.append({"image": r["image"], "id_number": mask(r["id_number"]), "id_cer": round(c, 3),
                    "name_cer": round(statistics.mean(part_cers), 3) if part_cers else "",
                    "genuine_score": g, "impostor_score": imp})
        print(f"{r['image']}: id CER {c:.3f}, name CER {out[-1]['name_cer']}, score {g} vs impostor {imp}")

    with (labels.parent / "ocr_results.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0]))
        w.writeheader()
        w.writerows(out)

    n = len(rows)
    p = lambda d: d["correct"] / d["extracted"] if d["extracted"] else 0.0  # noqa: E731
    print("\n=== OCR results ({} cards) ===".format(n))
    print(f"ID number  mean CER {statistics.mean(n_cer):.3f} | precision {p(num):.3f} | recall {num['correct'] / n:.3f}")
    print(f"Name parts mean CER {statistics.mean(name_cers):.3f} | precision {p(name):.3f} | "
          f"recall {name['correct'] / name['total']:.3f}")
    print(f"ocr_score  genuine mean {statistics.mean(genuine):.3f} (min {min(genuine):.3f}) | "
          f"impostor mean {statistics.mean(impostor):.3f} (max {max(impostor):.3f})")
    print(f"Saved {labels.parent / 'ocr_results.csv'}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
