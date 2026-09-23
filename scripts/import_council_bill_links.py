"""市議会の会期別議案一覧から、既存52件への公式詳細リンク候補を作る。"""

import hashlib
import html
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
URL = "https://himeji.gijiroku.com/g07_giketsu_s.asp?kaigi=122&sflg=2"
SNAPSHOT = ROOT / "data" / "sources" / "himeji-2025-4-council-bills.html"
OUTPUT = ROOT / "data" / "candidates" / "himeji-2025-4-council-bill-links.json"
PATTERN = re.compile(
    r'<li><a href="(?P<href>g07_giketsu_s\.asp\?sflg=3&amp;kaigi=122&amp;SrchID=\d+)">'
    r'(?P<title>.*?)<br\s*/?><span[^>]*>(?P<result>.*?)</span></a></li>',
    re.DOTALL,
)


def normalize(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value)).replace("−", "-")


def import_links(source: str, retrieved_at: str) -> list[dict]:
    items = {
        item["id"]: item
        for item in json.loads((ROOT / "data" / "himeji-2025-4.json").read_text(encoding="utf-8"))["items"]
    }
    source_sha256 = hashlib.sha256(source.encode("shift_jis")).hexdigest()
    rows = []
    for match in PATTERN.finditer(source):
        heading = html.unescape(re.sub(r"<[^>]+>", "", match.group("title"))).strip()
        number = re.match(r"^(議員提出議案|議案|諮問)第?(\d+)号[\s　]*(.*)$", normalize(heading))
        if not number:
            continue  # 報告など対象外
        prefix = {"議員提出議案": "member-bill-", "議案": "bill-", "諮問": "inquiry-"}[number.group(1)]
        item_id = prefix + number.group(2)
        if item_id not in items:
            continue
        saved_title = normalize(items[item_id]["title"]["raw"])
        if number.group(3) != saved_title:
            raise ValueError(f"市議会の件名と保存済み件名が違います: {item_id}")
        raw_result = html.unescape(re.sub(r"<[^>]+>", "", match.group("result"))).strip()
        rows.append({
            "itemId": item_id,
            "detailUrl": "https://himeji.gijiroku.com/" + html.unescape(match.group("href")),
            "headingRaw": heading,
            "resultLineRaw": raw_result,
            "sourceUrl": URL,
            "sourceSha256": source_sha256,
            "retrievedAt": retrieved_at,
            "reviewStatus": "unreviewed",
        })
    if len(rows) != 52 or {row["itemId"] for row in rows} != set(items):
        raise ValueError(f"対象52件の一意な対応が必要です: {len(rows)}件")
    return rows


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if "--download" in sys.argv or not SNAPSHOT.exists():
        with urlopen(URL, timeout=20) as response:
            raw = response.read()
        SNAPSHOT.write_bytes(raw)
    else:
        raw = SNAPSHOT.read_bytes()
    retrieved_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    result = import_links(raw.decode("shift_jis"), retrieved_at)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"市議会の議案別詳細リンク {len(result)}件")
