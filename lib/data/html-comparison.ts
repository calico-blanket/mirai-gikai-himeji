import { readFileSync } from "node:fs";
import { council } from "./council";

type FieldResult = { status: "exact" | "different" | "uncomparable"; storedRaw: string | null; officialRaw: string | null };
type ItemResult = { id: string; officialNumber: string; status: string; fields: Record<string, FieldResult>; exceptions: string[]; humanReviewStatus: string };
type Report = { statusCounts: Record<string, number>; items: ItemResult[]; comparedAt: string };

// scripts/compare_himeji_html.py の出力。件名セルの構造上の理由で例外になった行を、
// 確認者が原因を先に把握できるよう画面に出す。ここでの一致判定自体は verified 化の根拠にしない。
const report = JSON.parse(readFileSync("reports/himeji-2025-4-html-comparison.json", "utf8")) as Report;
const ids = new Set(council.items.map((item) => item.id));
for (const item of report.items) {
  if (!ids.has(item.id)) throw new Error(`HTML照合レポートの議案参照が不正です: ${item.id}`);
}

// 「例外がある」は135号のように人が既に見た上でverifiedにした行も含むため、
// 「2026-09-26の一括付与より前はunreviewedだった行」だけに絞る。
const bulkVerifiedIn20260926 = new Set(["bill-136", "bill-145", "bill-164", "bill-165", "bill-166", "member-bill-7"]);
export const htmlComparisonExceptions = report.items.filter((item) => bulkVerifiedIn20260926.has(item.id));
export const htmlComparisonComparedAt = report.comparedAt;
