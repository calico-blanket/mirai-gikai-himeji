"""Official committee PDFs: index only explicit bill-number mentions by PDF page."""

from __future__ import annotations

import hashlib
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE_CODE = ROOT / "app/sources/page.tsx"
BASE = "https://www.city.himeji.lg.jp/shisei/cmsfiles/contents/0000030/30346/"
DEST = ROOT / "data/candidates/himeji-2025-4-committee-pages.json"
CACHE = ROOT / "data/sources/committee-pdfs"
NUMBER = re.compile(r"(?<!議員提出)議案第\s*([0-9０-９]{1,3})\s*号")
MEMBER_NUMBER = re.compile(r"議員提出議案第\s*([0-9０-９]{1,3})\s*号")


def verify_saved(recomputed: dict, saved: dict) -> None:
    recomputed["retrievedAt"] = saved.get("retrievedAt")
    if recomputed != saved:
        raise ValueError("Saved committee candidates differ from the local official PDFs")


def main() -> None:
    check_only = sys.argv[1:] == ["--check"]
    if sys.argv[1:] and not check_only:
        raise ValueError("Usage: index_himeji_committee_pdfs.py [--check]")
    # The curated list is the same list of official links shown on /sources.
    code = SOURCE_CODE.read_text(encoding="utf-8")
    records = re.findall(r'\{ label: "([^"]+)", file: "([A-Za-z0-9]+\.pdf)" \}', code)
    if len(records) != 12 or len({file for _, file in records}) != 12:
        raise ValueError("Expected 12 distinct official committee PDF links")
    council = json.loads((ROOT / "data/himeji-2025-4.json").read_text(encoding="utf-8-sig"))
    item_ids = {item["id"] for item in council["items"]}
    CACHE.mkdir(parents=True, exist_ok=True)
    rows = []
    sources = []
    retrieved_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for label, file in records:
        url = BASE + file
        path = CACHE / file
        if not path.exists() and check_only:
            raise FileNotFoundError(f"Local official PDF missing: {path}")
        if not path.exists():
            request = urllib.request.Request(url, headers={"User-Agent": "mirai-gikai-himeji research/1.0"})
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = response.read()
            if not payload.startswith(b"%PDF"):
                raise ValueError(f"Not a PDF: {file}")
            path.write_bytes(payload)
        payload = path.read_bytes()
        reader = PdfReader(path)
        sources.append({"label": label, "file": file, "url": url, "sha256": hashlib.sha256(payload).hexdigest(), "pages": len(reader.pages)})
        for page_number, page in enumerate(reader.pages, 1):
            text = page.extract_text() or ""
            found = set()
            for match in NUMBER.finditer(text):
                found.add(f"bill-{int(match.group(1).translate(str.maketrans('０１２３４５６７８９', '0123456789')))}")
            for match in MEMBER_NUMBER.finditer(text):
                found.add(f"member-bill-{int(match.group(1).translate(str.maketrans('０１２３４５６７８９', '0123456789')))}")
            for item_id in sorted(found & item_ids):
                rows.append({"itemId": item_id, "file": file, "page": page_number})
        if not check_only:
            print(f"{file}: {len(reader.pages)} pages")
    result = {"sessionId": "himeji-2025-4", "method": "explicit_number_on_pdf_page", "reviewStatus": "unreviewed", "retrievedAt": retrieved_at, "sources": sources, "rows": rows}
    if check_only:
        saved = json.loads(DEST.read_text(encoding="utf-8"))
        verify_saved(result, saved)
        print(f"Verified {len(sources)} PDFs, {len(rows)} page references and {len({row['itemId'] for row in rows})} bills")
        return
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(rows)} page references, {len({row['itemId'] for row in rows})} bills -> {DEST}")


if __name__ == "__main__":
    main()
