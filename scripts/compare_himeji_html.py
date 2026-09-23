"""保存済み52件の原文を、取得済み公式HTMLの表セルと全件照合する。"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import random
import re

SOURCE_URL = "https://www.city.himeji.lg.jp/shisei/0000032187.html"
HTML_RETRIEVED_AT = "2026-09-22T08:36:34Z"
HEADERS = ["議案番号", "件名", "結果"]
FIELDS = ("officialNumber", "title", "officialSummary", "result")
NUMBER = re.compile(r"^(?:議案(?:第)?(\d+)号|諮問第(\d+)号|議員提出議案第(\d+)号)$")
SUMMARY = re.compile(r"([\[［].*[\]］])\s*$")


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


class OfficialCells(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self.table: list[list[str]] | None = None
        self.row: list[str] | None = None
        self.cell: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "table" and self.table is None:
            self.table = []
        elif tag == "tr" and self.table is not None:
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []
        elif tag == "br" and self.cell is not None:
            self.cell.append(" ")

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append(clean("".join(self.cell)))
            self.cell = None
        elif tag == "tr" and self.row is not None and self.table is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == "table" and self.table is not None:
            self.tables.append(self.table)
            self.table = None


def item_id(number: str) -> str | None:
    match = NUMBER.fullmatch(number)
    if not match:
        return None
    kind = "bill" if match.group(1) else "inquiry" if match.group(2) else "member-bill"
    return f"{kind}-{next(value for value in match.groups() if value)}"


def official_fields(row: list[str]) -> dict | None:
    if len(row) != 3 or not item_id(row[0]):
        return None
    match = SUMMARY.search(row[1])
    if match:
        title = row[1][:match.start()].strip()
        summary = match.group(1)
    elif "[" in row[1] or "［" in row[1]:
        return None
    else:
        title, summary = row[1], None
    if not title:
        return None
    return dict(zip(FIELDS, (row[0], title, summary, row[2])))


def compare(saved: dict, html: str) -> dict:
    parser = OfficialCells()
    parser.feed(html)
    tables = [table for table in parser.tables if table and table[0] == HEADERS]
    rows = [row for table in tables for row in table[1:]]
    by_id: dict[str, list[list[str]]] = {}
    for row in rows:
        key = item_id(row[0]) if row else None
        if key:
            by_id.setdefault(key, []).append(row)
    results = []
    for item in saved["items"]:
        candidates = by_id.get(item["id"], [])
        field_results = {}
        official = official_fields(candidates[0]) if len(candidates) == 1 else None
        for field in FIELDS:
            stored = item[field]
            stored_raw = stored["raw"] if stored["state"] == "known" else None
            source_raw = official[field] if official else None
            status = "uncomparable" if official is None else "exact" if stored_raw == source_raw else "different"
            field_results[field] = {"status": status, "storedRaw": stored_raw, "officialRaw": source_raw}
        statuses = [entry["status"] for entry in field_results.values()]
        status = "different" if "different" in statuses else "uncomparable" if "uncomparable" in statuses else "exact"
        exceptions = []
        if official and official["officialSummary"] is None:
            exceptions.append("公式件名セルに概要の括弧書きがない")
        if item["officialNumber"]["state"] == "known" and item["officialNumber"]["raw"] != item["officialNumber"]["value"]:
            exceptions.append("議案番号の原文と正規化値が異なる")
        results.append({"id": item["id"], "officialNumber": item["officialNumber"]["raw"], "status": status,
                        "fields": field_results, "exceptions": exceptions, "humanReviewStatus": item["reviewStatus"]})
    exceptions = [r["id"] for r in results if r["status"] != "exact" or r["exceptions"]]
    selected = [r["id"] for r in results if r["id"] in exceptions and r["humanReviewStatus"] != "verified"]
    sample_pool = [r["id"] for r in results if r["id"] not in exceptions and r["humanReviewStatus"] != "verified"]
    sample = random.Random(20250922).sample(sample_pool, min(5, len(sample_pool)))
    status_counts = Counter(r["status"] for r in results)
    field_counts = {field: Counter(r["fields"][field]["status"] for r in results) for field in FIELDS}
    return {"sourceUrl": SOURCE_URL, "sourceRetrievedAt": HTML_RETRIEVED_AT,
            "officialTableCount": len(tables), "officialRowCount": len(rows),
            "storedItemCount": len(saved["items"]), "statusCounts": {s: status_counts[s] for s in ("exact", "different", "uncomparable")},
            "fieldStatusCounts": {field: {s: field_counts[field][s] for s in ("exact", "different", "uncomparable")} for field in FIELDS},
            "focusedHumanReview": {"differencesAndExceptions": selected, "randomSampleSeed": 20250922, "randomSample": sample},
            "items": results}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--html", type=Path, default=Path("data/sources/himeji-2025-4.html"))
    p.add_argument("--data", type=Path, default=Path("data/himeji-2025-4.json"))
    p.add_argument("--output", type=Path, default=Path("reports/himeji-2025-4-html-comparison.json"))
    args = p.parse_args()
    html_bytes = args.html.read_bytes()
    report = compare(json.loads(args.data.read_text(encoding="utf-8")), html_bytes.decode("utf-8"))
    report["comparedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    report["officialHtmlSha256"] = hashlib.sha256(html_bytes).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("officialTableCount", "officialRowCount", "storedItemCount", "statusCounts", "fieldStatusCounts", "focusedHumanReview")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
