"""保存済みの姫路市公式議案書PDFから、議案本文の開始ページを抽出する。"""

import hashlib
import json
import logging
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "data" / "sources"
OUTPUT = ROOT / "data" / "candidates" / "himeji-2025-4-bill-pages.json"
BASE_URL = "https://www.city.himeji.lg.jp/shisei/cmsfiles/contents/0000030/30105/"
PDF_FILES = [
    "R7-4_hoseiyosan_gian135-136.pdf",
    "R7-4_gian137-163_hokoku25-28.pdf",
    "R7-4_hoseiyosan_gian164-166.pdf",
    "R7-4_gian167-173_shimon1-12.pdf",
]


def normalize(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value))


def extract() -> list[dict]:
    items = {
        item["id"]: item
        for item in json.loads((ROOT / "data" / "himeji-2025-4.json").read_text(encoding="utf-8"))["items"]
    }
    retrieved_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    rows = []
    for filename in PDF_FILES:
        path = SOURCE_DIR / filename
        if not path.is_file():
            raise FileNotFoundError(path)
        pdf_sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
        for page_number, page in enumerate(PdfReader(path).pages, 1):
            text = normalize(page.extract_text() or "")
            match = re.match(r"^(議案|諮問)第(\d+)号令和7年", text)
            if not match:
                continue
            item_id = ("bill-" if match.group(1) == "議案" else "inquiry-") + match.group(2)
            item = items.get(item_id)
            if item is None:
                raise ValueError(f"対象外の開始ページ: {filename} {page_number} {item_id}")
            title = normalize(item["title"]["raw"])
            if title in text:
                match_level = "number_and_full_title"
            else:
                # HTMLの件名セルには括弧書きの概要を付けた6件がある。
                base_title = normalize(re.split(r"[（(]", item["title"]["raw"], maxsplit=1)[0])
                if not base_title or base_title not in text:
                    raise ValueError(f"件名の先頭が合いません: {filename} {page_number} {item_id}")
                match_level = "number_and_title_prefix"
            rows.append({
                "itemId": item_id,
                "officialNumberRaw": match.group(0).replace("令和7年", ""),
                "pdfUrl": BASE_URL + filename,
                "pdfFile": filename,
                "page": page_number,
                "matchLevel": match_level,
                "sourceSha256": pdf_sha256,
                "retrievedAt": retrieved_at,
                "reviewStatus": "unreviewed",
            })
    if len(rows) != 51 or len({row["itemId"] for row in rows}) != 51:
        raise ValueError(f"51件の一意な開始ページが必要です: {len(rows)}件")
    if set(items) - {row["itemId"] for row in rows} != {"member-bill-7"}:
        raise ValueError("未対応議案が想定と異なります")
    return rows


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    logging.getLogger("pypdf").setLevel(logging.ERROR)
    result = extract()
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"開始ページ {len(result)}件、正式名称一致 {sum(row['matchLevel'] == 'number_and_full_title' for row in result)}件、件名先頭一致 {sum(row['matchLevel'] == 'number_and_title_prefix' for row in result)}件")
