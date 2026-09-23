"""原文照合とPDF記号変換の誤判定を防ぐテスト。"""

import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from compare_himeji_html import compare
from extract_himeji_votes import vote_from_raw

ROOT = Path(__file__).resolve().parents[1]


class SourceReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.saved = json.loads((ROOT / "data/himeji-2025-4.json").read_text(encoding="utf-8"))
        cls.html = (ROOT / "data/sources/himeji-2025-4.html").read_text(encoding="utf-8")

    def test_all_52_original_fields_match_and_only_135_is_human_verified(self):
        report = compare(self.saved, self.html)
        self.assertEqual(report["officialRowCount"], 52)
        self.assertEqual(report["statusCounts"], {"exact": 52, "different": 0, "uncomparable": 0})
        self.assertEqual([row["id"] for row in report["items"] if row["humanReviewStatus"] == "verified"], ["bill-135"])
        self.assertTrue(all(row["humanReviewStatus"] == "unreviewed" for row in report["items"] if row["id"] != "bill-135"))

    def test_changed_original_is_detected(self):
        changed = copy.deepcopy(self.saved)
        changed["items"][0]["result"]["raw"] = "否決"
        report = compare(changed, self.html)
        self.assertEqual(report["statusCounts"], {"exact": 51, "different": 1, "uncomparable": 0})
        self.assertEqual(report["items"][0]["fields"]["result"]["status"], "different")

    def test_missing_official_row_is_uncomparable(self):
        missing = self.html.replace("議案第135号", "番号欠落", 1)
        report = compare(self.saved, missing)
        self.assertEqual(report["statusCounts"], {"exact": 51, "different": 0, "uncomparable": 1})

    def test_blank_and_unknown_are_never_for(self):
        self.assertEqual(vote_from_raw(None)["state"], "not_collected")
        self.assertEqual(vote_from_raw("?")["state"], "unknown")
        for mark, value in [("○", "for"), ("〇", "for"), ("✕", "against"),
                            ("欠", "absent"), ("退", "left"), ("除", "recused"),
                            ("-", "chair_not_voting")]:
            with self.subTest(mark=mark):
                self.assertEqual(vote_from_raw(mark)["value"], value)


if __name__ == "__main__":
    unittest.main()
