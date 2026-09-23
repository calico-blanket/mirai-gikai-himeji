import snapshot from "../../data/himeji-2025-4.json";
import { parseCouncilData } from "./schema";

// 保存済みJSON以外へアクセスしない。ビルド時にも整合性を検証する。
export const council = parseCouncilData(snapshot);

export const officialSource = council.sources[0];

export function itemById(id: string) {
  return council.items.find((item) => item.id === id);
}

export function formatRetrievedAt(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

export function missingLabel(state: string) {
  switch (state) {
    case "not_collected": return "未取得";
    case "not_in_official_source": return "公式HTMLに記載なし";
    default: return "不明";
  }
}
