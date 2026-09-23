"""公式会議録画面と同じ公開GETを使い、対象会期の本会議だけを保存する。"""

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "data" / "sources"
API = "https://himeji.gijiroku.com/voices2/cgi/VoiJson.exe"
SESSION_TITLE = "令和7年第4回定例会"


def fetch_or_read(filename, params):
    path = SOURCES / filename
    url = API + "?" + urlencode(params)
    if path.exists():
        raw = path.read_bytes()
        retrieved_at = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
    else:
        with urlopen(url, timeout=30) as response:
            raw = response.read()
        parsed = json.loads(raw.decode("utf-8-sig"))
        if parsed.get("status") != 0:
            raise ValueError(f"公式会議録の取得エラー: {parsed.get('status')}")
        path.write_bytes(raw)
        retrieved_at = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
    parsed = json.loads(raw.decode("utf-8-sig"))
    return parsed, {
        "snapshotFile": filename,
        "retrievalUrl": url,
        "retrievedAt": retrieved_at.isoformat().replace("+00:00", "Z"),
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
    }


def main():
    index, index_source = fetch_or_read("himeji-2025-4-minutes-index.json", {
        "AA": "100", "CA": "0,1,2,3", "DA": "1", "KA": SESSION_TITLE,
        "BB": "1", "FB": "1", "BA": "0", "XA": "50", "QA": "1", "ZA": "UTF8",
    })
    matches = index["searchlist"]["data"]
    if len(matches) != 1 or matches[0]["TITL"] != SESSION_TITLE:
        raise ValueError("対象会期を一意に特定できません")
    entries = matches[0]["HITHU"]
    if len(entries) != 5:
        raise ValueError("本会議5日分の記録を想定しています")
    sources = []
    for entry in entries:
        fino = entry["FINO"]
        if not fino.isdigit():
            raise ValueError("会議録IDが不正です")
        payload, source = fetch_or_read(f"himeji-2025-4-minutes-{fino}.json", {
            "AA": "200", "OA": fino, "RA": "HTGN", "CA": "0,1,2,3", "DA": "1,2,3", "EB": "1", "ZA": "UTF8",
        })
        meeting = payload["filist"]
        if meeting["TITL"] != SESSION_TITLE or str(meeting["FINO"]) != fino:
            raise ValueError("会期または記録IDが一致しません")
        if int(meeting["allcount"]) != len(meeting["data"]):
            raise ValueError("発言の取得件数が不足しています")
        source.update({
            "recordId": fino,
            "meetingTitleRaw": meeting["TITL"],
            "meetingSubtitleRaw": meeting["SUBT"],
            "meetingDate": datetime.strptime(meeting["DATE"], "%Y%m%d").date().isoformat(),
            "speechCount": len(meeting["data"]),
            "url": f"https://himeji.gijiroku.com/voices2/minutes.html?FINO={fino}",
            "reviewStatus": "unreviewed",
        })
        sources.append(source)
        print(f"{source['meetingDate']}: {source['speechCount']}発言")
    output = {"sessionId": "himeji-2025-4", "scope": "plenary_only", "indexSource": index_source, "sources": sources}
    (ROOT / "data" / "candidates" / "himeji-2025-4-minutes-sources.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
