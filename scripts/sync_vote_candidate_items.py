"""vote-candidates.jsonのitemsを、議案本体data/himeji-2025-4.jsonのitemsと同期する。

candidate-validation.tsはPDF候補が画面用の議案データ（reviewStatus等を含む）と
完全一致することを要求している。議案側のreviewStatusを更新した場合はここで同期する。
PDFの抽出結果（votes/members等）自体は変更しない。
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--base", type=Path, default=Path("data/himeji-2025-4.json"))
    p.add_argument("--candidates", type=Path, default=Path("data/candidates/himeji-2025-4-vote-candidates.json"))
    args = p.parse_args()

    base = json.loads(args.base.read_text(encoding="utf-8"))
    candidates = json.loads(args.candidates.read_text(encoding="utf-8"))

    base_ids = [item["id"] for item in base["items"]]
    candidate_ids = [item["id"] for item in candidates["items"]]
    if base_ids != candidate_ids:
        raise ValueError("議案の並び・件数が一致しないため同期しません。PDF再抽出が必要な可能性があります。")

    candidates["items"] = base["items"]
    args.candidates.write_text(json.dumps(candidates, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{args.candidates} のitemsを同期しました（{len(base_ids)}件）。")


if __name__ == "__main__":
    main()
