"""令和7年第4回定例会の公式HTMLを、検証前のローカルJSONに変換する。"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.request import Request, urlopen


SOURCE_URL = "https://www.city.himeji.lg.jp/shisei/0000032187.html"
SOURCE_ID = "himeji-32187-html"
SESSION_ID = "himeji-2025-4"
HEADERS = ["議案番号", "件名", "結果"]
RESULTS = {"可決": "passed", "否決": "rejected", "同意": "consented"}
NUMBER = re.compile(r"^(?:議案(?:第)?(\d+)号|諮問第(\d+)号|議員提出議案第(\d+)号)$")
SUMMARY = re.compile(r"([\[［].*[\]］])\s*$")


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


class CouncilTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self.table: list[list[str]] | None = None
        self.row: list[str] | None = None
        self.cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "table" and self.table is None:
            self.table = []
        elif tag == "tr" and self.table is not None:
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []
        elif tag == "br" and self.cell is not None:
            self.cell.append(" ")

    def handle_data(self, data: str) -> None:
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append(clean("".join(self.cell)))
            self.cell = None
        elif tag == "tr" and self.row is not None and self.table is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == "table" and self.table is not None:
            self.tables.append(self.table)
            self.table = None


def known(raw: str, value: str) -> dict:
    return {"state": "known", "raw": raw, "value": value}


def unavailable(state: str) -> dict:
    return {"state": state, "raw": None, "value": None}


def number_parts(raw: str) -> tuple[str, str]:
    match = NUMBER.fullmatch(raw)
    if match is None:
        raise ValueError(f"見慣れない議案番号: {raw!r}")
    bill, inquiry, member_bill = match.groups()
    if bill:
        return f"bill-{bill}", f"議案第{bill}号"
    if inquiry:
        return f"inquiry-{inquiry}", raw
    return f"member-bill-{member_bill}", raw


def split_title_and_summary(cell: str) -> tuple[str, str | None]:
    match = SUMMARY.search(cell)
    if match is None:
        if "[" in cell or "［" in cell:
            raise ValueError(f"概要の括弧を解析できません: {cell[:80]}")
        return cell, None
    title = cell[: match.start()].strip()
    if not title:
        raise ValueError("正式名称が空です")
    raw_summary = match.group(1)
    if len(raw_summary) < 3:
        raise ValueError("公式概要が空です")
    return title, raw_summary


def import_html(html: str, retrieved_at: str) -> dict:
    parser = CouncilTableParser()
    parser.feed(html)
    tables = [table for table in parser.tables if table and table[0] == HEADERS]
    if len(tables) != 3:
        raise ValueError(f"議案表は3つを想定していますが、{len(tables)}件でした")
    rows = [row for table in tables for row in table[1:]]
    if len(rows) != 52:
        raise ValueError(f"公式HTMLの52行を想定していますが、{len(rows)}件でした")

    items = []
    seen = set()
    for row in rows:
        if len(row) != 3:
            raise ValueError(f"3列ではない議案行: {row!r}")
        number_raw, title_cell, result_raw = row
        item_id, number_value = number_parts(number_raw)
        if item_id in seen:
            raise ValueError(f"重複する議案番号: {number_raw}")
        seen.add(item_id)
        title_raw, summary_raw = split_title_and_summary(title_cell)
        if result_raw not in RESULTS:
            raise ValueError(f"未対応の議決結果: {result_raw}")
        field_evidence = {
            field: {"sourceId": SOURCE_ID, "retrievedAt": retrieved_at, "reviewStatus": "unreviewed"}
            for field in ("officialNumber", "title", "officialSummary", "result")
        }
        items.append({
            "id": item_id,
            "sessionId": SESSION_ID,
            "officialNumber": known(number_raw, number_value),
            "title": known(title_raw, title_raw),
            "officialSummary": known(summary_raw, summary_raw[1:-1].strip()) if summary_raw else unavailable("not_in_official_source"),
            "result": known(result_raw, RESULTS[result_raw]),
            "fieldEvidence": field_evidence,
            "sourceIds": [SOURCE_ID],
            "reviewStatus": "unreviewed",
        })

    return {
        "schemaVersion": 1,
        "counts": {"sessions": 1, "items": len(items), "members": 0, "factions": 0, "memberships": 0, "votes": 0, "sources": 1},
        "sessions": [{
            "id": SESSION_ID,
            "title": known("令和7年第4回定例会", "令和7年第4回定例会"),
            "startDate": unavailable("not_in_official_source"),
            "endDate": unavailable("not_in_official_source"),
            "sourceIds": [SOURCE_ID],
            "reviewStatus": "unreviewed",
        }],
        "items": items,
        "members": [], "factions": [], "memberships": [], "votes": [],
        "sources": [{
            "id": SOURCE_ID,
            "title": known("令和7年第4回定例会　議案及び審議結果", "令和7年第4回定例会　議案及び審議結果"),
            "url": SOURCE_URL,
            "retrievedAt": retrieved_at,
            "reviewStatus": "unreviewed",
        }],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--html", type=Path, help="取得済みHTMLを使用する場合")
    parser.add_argument("--output", type=Path, default=Path("data/himeji-2025-4.json"))
    args = parser.parse_args()
    if args.html:
        html = args.html.read_text(encoding="utf-8")
    else:
        request = Request(SOURCE_URL, headers={"User-Agent": "mirai-gikai-himeji/0.1 (manual import)"})
        with urlopen(request, timeout=30) as response:
            html = response.read().decode("utf-8")
    retrieved_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    data = import_html(html, retrieved_at)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".json", dir=args.output.parent, delete=False) as output:
        output.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        pending = Path(output.name)
    try:
        subprocess.run(["node", "--experimental-strip-types", "scripts/validate-data.mjs", str(pending)], check=True)
        os.replace(pending, args.output)
    finally:
        pending.unlink(missing_ok=True)
    print(f"{len(data['items'])}件を {args.output} に保存しました。人による確認状態は未確認です。")


if __name__ == "__main__":
    main()
