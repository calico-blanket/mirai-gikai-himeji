"""公式採決PDFから人による照合前の議員・会派・賛否候補を作る。"""

from __future__ import annotations

import argparse
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path
import re
import sys

PDF_URL = "https://www.city.himeji.lg.jp/shisei/cmsfiles/contents/0000032/32187/teisyutugiannsinngikekka.pdf"
SOURCE_ID = "himeji-32187-votes-pdf"
RETRIEVED_AT = "2026-09-22T08:36:09Z"
SESSION_ID = "himeji-2025-4"
FACTION_GROUPS = [
    ("公明党", 1, 8), ("市民クラブ", 9, 16), ("自由民主党", 17, 23),
    ("新生ひめじ", 24, 28), ("日本維新の会", 29, 32),
    ("姫路無所属の会", 33, 35), ("改革無所属の会", 36, 38),
    ("志政会", 39, 40), ("日本共産党議員団", 41, 43),
    ("刷新の会", 44, 44), ("無所属", 45, 45),
]
SYMBOLS = {
    "○": "for", "〇": "for", "✕": "against", "×": "against",
    "欠": "absent", "退": "left", "除": "recused",
    "-": "chair_not_voting", "―": "chair_not_voting",
}
NUMBER = re.compile(r"^(?:議案(?:第)?(\d+)号|諮問第(\d+)号|議員提出議案第(\d+)号)$")


def sourced(raw: str | None, value: str | None, missing="unknown") -> dict:
    return {"state": "known", "raw": raw, "value": value} if value is not None else {"state": missing, "raw": raw, "value": None}


def item_id(number: str) -> str | None:
    match = NUMBER.fullmatch(number)
    if not match:
        return None
    prefix = "bill" if match.group(1) else "inquiry" if match.group(2) else "member-bill"
    return prefix + "-" + next(x for x in match.groups() if x)


def page_chars(page) -> list[tuple[str, float, float]]:
    chars = []
    for block in page.get_text("rawdict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                for char in span["chars"]:
                    x0, y0, x1, y1 = char["bbox"]
                    chars.append((char["c"], (x0 + x1) / 2, (y0 + y1) / 2))
    return chars


def vote_from_raw(raw: str | None) -> dict:
    if raw is None:
        return sourced(None, None, "not_collected")
    if raw in SYMBOLS:
        return sourced(raw, SYMBOLS[raw])
    return sourced(raw, None)


def extract(pdf_path: Path, base: dict, pymupdf) -> tuple[dict, list[dict], dict]:
    doc = pymupdf.open(pdf_path)
    if len(doc) != 4:
        raise ValueError(f"PDFページ数が想定と異なります: {len(doc)}")
    first_chars = page_chars(doc[0])
    columns = [412.2 + 18.1 * index for index in range(45)]
    members, memberships, factions = [], [], []
    for index, center in enumerate(columns, 1):
        name_chars = [(y, c) for c, x, y in first_chars if abs(x - center) < 2 and 210 <= y < 265]
        raw_name = "".join(c for y, c in sorted(name_chars))
        name = re.sub(r"\s+", "", raw_name)
        member_id = f"pdf-col-{index:02d}"
        faction = next((label for label, start, end in FACTION_GROUPS if start <= index <= end), None)
        if not name or faction is None:
            raise ValueError(f"PDFの議員名・会派列を特定できません: {index}")
        members.append({"id": member_id, "name": sourced(raw_name, name), "sourceIds": [SOURCE_ID], "reviewStatus": "unreviewed"})
        faction_id = f"pdf-faction-{next(i for i, group in enumerate(FACTION_GROUPS, 1) if group[0] == faction):02d}"
        memberships.append({"id": f"membership-{index:02d}", "sessionId": SESSION_ID, "memberId": member_id,
                            "factionId": sourced(faction, faction_id), "sourceIds": [SOURCE_ID], "reviewStatus": "unreviewed"})
    for index, (name, start, end) in enumerate(FACTION_GROUPS, 1):
        factions.append({"id": f"pdf-faction-{index:02d}", "name": sourced(name, name),
                         "sourceIds": [SOURCE_ID], "reviewStatus": "unreviewed"})
    if len(set(m["name"]["value"] for m in members)) != 45:
        raise ValueError("議員名が重複しています")

    # 各ページの列順が変わると同じ議員へ別人の票を割り当ててしまうため、見出しを全ページで照合する。
    for page_index, page in enumerate(doc):
        chars = page_chars(page)
        low, high = (210, 265) if page_index == 0 else (168, 225)
        for index, center in enumerate(columns):
            raw = "".join(c for y, c in sorted((y, c) for c, x, y in chars if abs(x-center) < 2 and low <= y < high))
            if re.sub(r"\s+", "", raw) != members[index]["name"]["value"]:
                raise ValueError(f"PDFの議員列見出しが一致しません: p{page_index+1} column{index+1}")
        faction_low, faction_high = (169, 210) if page_index == 0 else (127, 169)
        for faction, start, end in FACTION_GROUPS:
            # 見出しの文字はセル境界より少し横へ張り出すため15ptの余裕を持たせる。
            left, right = columns[start-1]-15, columns[end-1]+15
            words = [(y0, x0, word) for x0, y0, x1, y1, word, *_ in page.get_text("words")
                     if left <= x0 and x1 <= right and faction_low <= y0 < faction_high]
            extracted = "".join(word for y, x, word in sorted(words))
            if extracted != faction:
                raise ValueError(f"PDFの会派見出しが一致しません: p{page_index+1} {faction!r}: {extracted!r}")

    expected = {item["id"] for item in base["items"]}
    votes, review_rows, seen_items, exceptions = [], [], set(), []
    for page_index, page in enumerate(doc):
        chars = page_chars(page)
        row_count = [15, 16, 16, 5][page_index]
        first_y = 285.4 if page_index == 0 else 244.9
        for row_index in range(row_count):
            center_y = first_y + row_index * 40.93
            number_chars = [(y, x, c) for c, x, y in chars if 84 < x < 145 and abs(y - center_y) < 13]
            number_raw = "".join(c for y, x, c in sorted(number_chars)).replace(" ", "")
            key = item_id(number_raw)
            if key is None or key not in expected or key in seen_items:
                raise ValueError(f"PDF議案番号を一意に対応できません: p{page_index+1} row{row_index+1}: {number_raw!r}")
            seen_items.add(key)
            for column, member in enumerate(members, 1):
                xcenter = columns[column - 1]
                marks = [(y, c) for c, x, y in chars if abs(x - xcenter) < 3 and abs(y - center_y) < 8]
                raw = "".join(c for y, c in sorted(marks)) if marks else None
                position = vote_from_raw(raw)
                if position["state"] != "known":
                    exceptions.append({"itemId": key, "page": page_index+1, "row": row_index+1,
                                       "column": column, "raw": raw, "state": position["state"]})
                votes.append({"id": f"vote-{key}-{column:02d}", "itemId": key, "memberId": member["id"],
                              "membershipId": memberships[column-1]["id"], "position": position,
                              "sourceIds": [SOURCE_ID], "reviewStatus": "unreviewed"})
                review_rows.append({"itemId": key, "pdfNumberRaw": number_raw, "pdfPage": page_index+1,
                                    "pdfRow": row_index+1, "pdfColumn": column,
                                    "memberNameRaw": member["name"]["raw"],
                                    "memberNameNormalized": member["name"]["value"],
                                    "factionAtSession": memberships[column-1]["factionId"]["raw"],
                                    "voteRaw": raw or "", "voteState": position["state"],
                                    "voteNormalized": position["value"] or "",
                                    "sourceUrl": PDF_URL, "retrievedAt": RETRIEVED_AT,
                                    "humanReviewStatus": "unreviewed"})
    if seen_items != expected:
        raise ValueError(f"PDFとHTMLの案件集合が一致しません: PDFにない={sorted(expected-seen_items)}")
    if len(votes) != len(expected) * len(members):
        raise ValueError("PDFの案件×議員の票数が一致しません")
    candidate = json.loads(json.dumps(base))
    candidate["members"], candidate["factions"] = members, factions
    candidate["memberships"], candidate["votes"] = memberships, votes
    candidate["sources"].append({"id": SOURCE_ID, "title": sourced("提出議案とその結果（令和7年第4回定例会）", "提出議案とその結果（令和7年第4回定例会）"),
                                 "url": PDF_URL, "retrievedAt": RETRIEVED_AT, "reviewStatus": "unreviewed"})
    for key in ("members", "factions", "memberships", "votes", "sources"):
        candidate["counts"][key] = len(candidate[key])
    report = {"pdfUrl": PDF_URL, "retrievedAt": RETRIEVED_AT, "pdfSha256": hashlib.sha256(pdf_path.read_bytes()).hexdigest(),
              "pdfPages": len(doc), "itemRows": len(seen_items), "memberColumns": len(members),
              "factionCounts": dict(Counter(row["factionAtSession"] for row in review_rows[:45])),
              "symbolCounts": dict(Counter(row["voteRaw"] or "<blank>" for row in review_rows)),
              "normalizedCounts": dict(Counter(row["voteNormalized"] or row["voteState"] for row in review_rows)),
              "extractionExceptions": exceptions, "humanReviewStatus": "unreviewed",
              "note": "機械抽出の候補。所属と賛否は原PDFとの人手照合前で、公開用ではない。"}
    return candidate, review_rows, report


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--pdf", type=Path, default=Path("data/sources/himeji-2025-4-votes.pdf"))
    p.add_argument("--base", type=Path, default=Path("data/himeji-2025-4.json"))
    p.add_argument("--output-dir", type=Path, default=Path("data/candidates"))
    args = p.parse_args()
    sys.path.insert(0, str(Path(".work/pdf").resolve()))
    import pymupdf  # PDF解析専用。アプリ実行時の依存関係には加えない。
    candidate, rows, report = extract(args.pdf, json.loads(args.base.read_text(encoding="utf-8")), pymupdf)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "himeji-2025-4-vote-candidates.json").write_text(json.dumps(candidate, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with (args.output_dir / "himeji-2025-4-vote-review.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    locations = {}
    for row in rows:
        location = {"itemId": row["itemId"], "pdfNumberRaw": row["pdfNumberRaw"],
                    "page": row["pdfPage"], "row": row["pdfRow"]}
        previous = locations.setdefault(row["itemId"], location)
        if previous != location:
            raise ValueError(f"同一議案のPDF位置が一致しません: {row['itemId']}")
    (args.output_dir / "himeji-2025-4-vote-locations.json").write_text(
        json.dumps(list(locations.values()), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (args.output_dir / "himeji-2025-4-vote-extraction.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("itemRows", "memberColumns", "factionCounts", "symbolCounts", "normalizedCounts", "extractionExceptions")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
