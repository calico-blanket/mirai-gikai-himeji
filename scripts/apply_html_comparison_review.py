"""compare_himeji_html.pyの照合結果を根拠に、4項目すべてexact一致の議案だけをverifiedにする。

差分・比較不能・例外があるフィールドを持つ議案は対象外とし、個別確認に残す。
確認者・確認日時・根拠は reports/himeji-2025-4-html-comparison.json 側に残し、
data/himeji-2025-4.json のスキーマ（fieldEvidence）は変更しない。
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

FIELDS = ("officialNumber", "title", "officialSummary", "result")


def apply_review(data: dict, report: dict) -> tuple[dict, list[str], list[str]]:
    by_id = {item["id"]: item for item in report["items"]}
    verified_ids: list[str] = []
    skipped_ids: list[str] = []
    for entry in data["items"]:
        result = by_id.get(entry["id"])
        if result is None:
            raise ValueError(f"照合レポートに議案がありません: {entry['id']}")
        all_exact = all(result["fields"][field]["status"] == "exact" for field in FIELDS)
        if not all_exact or result["exceptions"]:
            skipped_ids.append(entry["id"])
            continue
        if entry["reviewStatus"] == "verified":
            continue
        for field in FIELDS:
            entry["fieldEvidence"][field]["reviewStatus"] = "verified"
        entry["reviewStatus"] = "verified"
        verified_ids.append(entry["id"])
    return data, verified_ids, skipped_ids


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data", type=Path, default=Path("data/himeji-2025-4.json"))
    p.add_argument("--report", type=Path, default=Path("reports/himeji-2025-4-html-comparison.json"))
    p.add_argument("--reviewer", required=True, help="確認者名（活動名可）")
    p.add_argument("--apply", action="store_true", help="指定時のみ保存する。既定は確認のみ")
    args = p.parse_args()

    data = json.loads(args.data.read_text(encoding="utf-8"))
    report = json.loads(args.report.read_text(encoding="utf-8"))

    updated, verified_ids, skipped_ids = apply_review(data, report)

    print(f"verified対象: {len(verified_ids)}件")
    for item_id in verified_ids:
        print(f"  - {item_id}")
    print(f"個別確認が必要（例外あり）: {len(skipped_ids)}件")
    for item_id in skipped_ids:
        print(f"  - {item_id}")

    if not args.apply:
        print("--apply未指定のため保存していません。")
        return
    if not verified_ids:
        print("verified対象がないため保存しません。")
        return
    args.data.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report["humanReview"] = {
        "reviewer": args.reviewer,
        "checkedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "method": "全52件の機械照合結果（officialNumber/title/officialSummary/resultの4項目exact一致）を人が一覧確認し、例外一覧の妥当性を検証したうえで一括承認",
        "verifiedItemIds": verified_ids,
        "excludedItemIds": skipped_ids,
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{args.data} と {args.report} を更新しました。")


if __name__ == "__main__":
    main()
