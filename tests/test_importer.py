"""公式HTMLの表形式が変わった場合に誤ったJSONを保存しないための確認。"""

import unittest

from scripts.import_himeji_html import import_html


def page(result="可決", row_count=52, broken_summary=False):
    rows = []
    for index in range(row_count):
        number = f"議案第{100 + index}号"
        title = f"試験用の件名{index}"
        if index == 0:
            title += "<br>[試験用の公式概要]" if not broken_summary else "<br>[閉じていない概要"
        rows.append(f"<tr><td>{number}</td><td><p>{title}</p></td><td>{result}</td></tr>")
    sections = [rows[:25], rows[25:51], rows[51:]]
    header = "<tr><th>議案番号</th><th>件名</th><th>結果</th></tr>"
    return "".join(f"<table>{header}{''.join(section)}</table>" for section in sections)


class ImportHtmlTests(unittest.TestCase):
    def test_parses_summary_and_missing_summary_separately(self):
        data = import_html(page(), "2026-09-22T00:00:00+00:00")
        self.assertEqual(len(data["items"]), 52)
        self.assertEqual(data["items"][0]["officialSummary"]["raw"], "[試験用の公式概要]")
        self.assertEqual(data["items"][1]["officialSummary"]["state"], "not_in_official_source")

    def test_rejects_missing_row(self):
        with self.assertRaisesRegex(ValueError, "52行"):
            import_html(page(row_count=51), "2026-09-22T00:00:00+00:00")

    def test_rejects_unknown_result(self):
        with self.assertRaisesRegex(ValueError, "未対応の議決結果"):
            import_html(page(result="未定義"), "2026-09-22T00:00:00+00:00")

    def test_rejects_unclosed_summary(self):
        with self.assertRaisesRegex(ValueError, "概要の括弧"):
            import_html(page(broken_summary=True), "2026-09-22T00:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
