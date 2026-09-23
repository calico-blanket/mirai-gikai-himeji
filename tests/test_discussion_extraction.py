"""固定した公式会議録からの再生成と誤対応防止を確認する。ネットワーク不要。"""
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("discussion_extraction", ROOT / "scripts/extract_himeji_discussions.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DiscussionExtractionTest(unittest.TestCase):
    def test_regeneration_matches_saved_candidate(self):
        saved = json.loads((ROOT / "data/candidates/himeji-2025-4-discussions.json").read_text(encoding="utf-8"))
        self.assertEqual(module.generate(), saved)

    def test_historical_references_and_other_answers_are_excluded(self):
        rows = module.generate()["rows"]
        self.assertFalse(any(row["itemId"] == "bill-172" and row["recordId"] == "2417" for row in rows))
        answers = [row["speechId"] for row in rows if row["kind"] == "answer" and row["itemId"] == "bill-135"]
        self.assertEqual(answers, ["202111"])
        self.assertFalse(any(row["itemId"] == "member-bill-7" for row in rows))


if __name__ == "__main__":
    unittest.main()
