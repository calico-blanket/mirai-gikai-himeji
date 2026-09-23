"""対象会期の公式質疑一覧から、議案番号を明記した質問項目だけを抽出する。"""

import hashlib
import html
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
URL = "https://himeji.gijiroku.com/g07_Shitsumon.asp?kaigi=122&Sflg=2"
SNAPSHOT = ROOT / "data" / "sources" / "himeji-2025-4-questions.html"
OUTPUT = ROOT / "data" / "candidates" / "himeji-2025-4-question-topics.json"


def plain(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value)).strip()


def import_topics(source: str, retrieved_at: str) -> list[dict]:
    ids = {item["id"] for item in json.loads((ROOT / "data" / "himeji-2025-4.json").read_text(encoding="utf-8"))["items"]}
    source_sha256 = hashlib.sha256(source.encode("shift_jis")).hexdigest()
    rows = []
    for table_row in re.finditer(r"<tr\b[^>]*>(.*?)</tr>", source, re.DOTALL | re.IGNORECASE):
        fragment = table_row.group(1)
        speaker = re.search(r"<strong>(.*?)</strong>", fragment, re.DOTALL)
        if not speaker:
            continue
        for topic in re.finditer(r"<div class='comment4'>(.*?)</div>", fragment, re.DOTALL):
            topic_raw = plain(topic.group(1))
            for match in re.finditer(r"議案第\s*(\d+)号", topic_raw):
                item_id = "bill-" + match.group(1)
                if item_id not in ids:
                    continue
                rows.append({
                    "itemId": item_id,
                    "speakerRaw": plain(speaker.group(1)),
                    "topicRaw": topic_raw,
                    "sourceUrl": URL,
                    "sourceSha256": source_sha256,
                    "retrievedAt": retrieved_at,
                    "reviewStatus": "unreviewed",
                })
    if len(rows) != 2 or {row["itemId"] for row in rows} != {"bill-135", "bill-154"}:
        raise ValueError(f"議案番号を明記した質問項目の構造が想定と異なります: {len(rows)}件")
    return rows


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if "--download" in sys.argv or not SNAPSHOT.exists():
        with urlopen(URL, timeout=20) as response:
            raw = response.read()
        SNAPSHOT.write_bytes(raw)
    else:
        raw = SNAPSHOT.read_bytes()
    result = import_topics(raw.decode("shift_jis"), datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"議案番号を明記した公式質問項目 {len(result)}件")
