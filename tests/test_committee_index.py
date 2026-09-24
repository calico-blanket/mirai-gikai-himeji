"""Reject changed committee PDF candidates before showing them as references."""

import copy
import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("committee_index", ROOT / "scripts/index_himeji_committee_pdfs.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CommitteeIndexTest(unittest.TestCase):
    def setUp(self):
        self.saved = json.loads(MODULE.DEST.read_text(encoding="utf-8"))

    def test_same_candidate_is_accepted(self):
        MODULE.verify_saved(copy.deepcopy(self.saved), self.saved)

    def test_changed_bill_or_page_is_rejected(self):
        for field, value in (("itemId", "bill-999"), ("page", 999)):
            changed = copy.deepcopy(self.saved)
            changed["rows"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                MODULE.verify_saved(changed, self.saved)

    def test_changed_pdf_hash_or_review_status_is_rejected(self):
        for field, value in (("sha256", "0" * 64), ("reviewStatus", "verified")):
            changed = copy.deepcopy(self.saved)
            if field == "sha256":
                changed["sources"][0][field] = value
            else:
                changed[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                MODULE.verify_saved(changed, self.saved)


if __name__ == "__main__":
    unittest.main()
