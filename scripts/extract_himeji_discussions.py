"""保存済みの本会議録から再現可能な対応候補を生成する。確認済みにはしない。"""
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def normalized(text):
    return unicodedata.normalize("NFKC", text)


def generate():
    manifest = json.loads((ROOT / "data/candidates/himeji-2025-4-minutes-sources.json").read_text(encoding="utf-8"))
    items = {item["id"] for item in json.loads((ROOT / "data/himeji-2025-4.json").read_text(encoding="utf-8"))["items"]}
    meetings = {}
    rows = []
    for source in manifest["sources"]:
        raw = (ROOT / "data/sources" / source["snapshotFile"]).read_bytes()
        if hashlib.sha256(raw).hexdigest() != source["sourceSha256"]:
            raise ValueError("保存済み会議録の版が変わっています")
        meetings[source["recordId"]] = (source, json.loads(raw.decode("utf-8-sig"))["filist"]["data"])

    def add(record, speech, item, kind, method, indexes, evidence=None):
        if item not in items:
            raise ValueError(f"対象外の議案: {item}")
        source, speeches = meetings[record]
        entry = next(s for s in speeches if s["HUID"] == speech)
        paragraphs = entry["HTGN"].splitlines()
        rows.append({
            "id": f"{record}-{speech}-{item}", "itemId": item, "recordId": record,
            "speechId": speech, "kind": kind, "method": method,
            "paragraphIndexes": indexes,
            "excerptRaw": "\n".join(paragraphs[i] for i in indexes),
            "evidence": evidence or [], "sourceSha256": source["sourceSha256"],
            "reviewStatus": "unreviewed",
        })

    # 提案説明の段落境界。段落の途中に出る別議案や過年度の番号を拾わない。
    # 0始まりの段落番号。複数案件を一緒に説明する段落は同じ範囲を共有する。
    blocks = [
        ("2417", "202071", "bill", [(135,135,2,12),(136,136,13,15)] +
         [(n,n,n-121,n-121) for n in range(137,151)] +
         [(151,153,30,31),(154,154,32,32),(155,158,33,34),(159,159,35,35),
          (160,160,36,36),(161,162,37,37),(163,163,38,38)]),
        ("2433", "203273", "bill", [(164,164,2,11),(165,165,12,15),(166,166,16,19)] +
         [(n,n,n-147,n-147) for n in range(167,174)]),
        ("2433", "203273", "inquiry", [(1,4,28,28),(5,12,29,29)]),
    ]
    for record, speech, prefix, spans in blocks:
        paragraphs = next(s for s in meetings[record][1] if s["HUID"] == speech)["HTGN"].splitlines()
        for start_number, end_number, start, end in spans:
            lead = normalized(paragraphs[start]).strip()
            label = "議案" if prefix == "bill" else "諮問"
            if not re.match(rf"(?:続きまして、)?{label}第?{start_number}号", lead):
                raise ValueError(f"提案説明の段落先頭が変わっています: {record}/{start}")
            for number in range(start_number, end_number + 1):
                add(record, speech, f"{prefix}-{number}", "proposal", "proposal_block", list(range(start, end + 1)))

    # 議長の一括上程・採決読み上げ、出席者一覧は議論として掲載しない。
    # 番号のない発言は自動で前の議案へ引き継がない。
    for record, (_, speeches) in meetings.items():
        for speech in speeches:
            if str(speech.get("KTYP")) in {"0", "1"} or speech["HUID"] in {"202071", "203273"}:
                continue
            matches = {}
            for index, paragraph in enumerate(speech["HTGN"].splitlines()):
                text = normalized(paragraph)
                for match in re.finditer(r"(議案|諮問)第?(\d+)号", text):
                    # 明示された過年度への言及を候補にしない（説明段落も別処理）。
                    before = text[:match.start()]
                    if re.search(r"令和[1-6]年[^。]*$", before):
                        continue
                    item = ("bill-" if match[1] == "議案" else "inquiry-") + match[2]
                    if item in items:
                        matches.setdefault(item, set()).add(index)
            role = speech["YAKU"]
            kind = "committee_report" if "委員会委員長" in role else "debate" if role == "議員" and "討論" in speech["HTGN"] else "question" if role == "議員" else "answer"
            for item, indexes in matches.items():
                add(record, speech["HUID"], item, kind, "explicit_number", sorted(indexes))

    # 杉本議員の第1項目への答弁だけを文脈候補とする。他の項目の答弁は含めない。
    speeches = {s["HUID"]: s for s in meetings["2418"][1]}
    anchors = [("202103", 2, "初めに、議案第135号"), ("202105", 1, "杉本博昭議員の質疑質問に対する答弁"), ("202111", 1, "1項目めについてお答え")]
    evidence = []
    for speech, index, expected in anchors:
        paragraphs = speeches[speech]["HTGN"].splitlines()
        # 議長発言は本文が第0段落の場合もあるため、文言から一意に特定する。
        found = [(i, p) for i, p in enumerate(paragraphs) if expected in normalized(p)]
        if len(found) != 1:
            raise ValueError(f"答弁の対応根拠が一意ではありません: {speech}")
        index, raw = found[0]
        evidence.append({"speechId": speech, "paragraphIndex": index, "raw": raw})
    add("2418", "202111", "bill-135", "answer", "contextual_answer", list(range(1, len(speeches["202111"]["HTGN"].splitlines()))), evidence)
    rows.sort(key=lambda row: (int(row["recordId"]), int(row["speechId"]), row["itemId"]))
    return {"sessionId": "himeji-2025-4", "scope": "plenary_only", "rows": rows}


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    result = generate()
    (ROOT / "data/candidates/himeji-2025-4-discussions.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(result['rows'])}対応候補 / {len({row['itemId'] for row in result['rows']})}案件（すべて人による確認前）")
