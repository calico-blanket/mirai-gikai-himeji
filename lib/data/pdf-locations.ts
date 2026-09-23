import locations from "../../data/candidates/himeji-2025-4-vote-locations.json";
import { council } from "./council";

// 抽出位置は照合の手掛かりであり、議員別賛否の人による確認を意味しない。
export function validatePdfLocations(rows: { itemId: string; pdfNumberRaw: string; page: number; row: number }[]) {
  const byId = new Map<string, (typeof rows)[number]>();
  for (const location of rows) {
    if (byId.has(location.itemId)) throw new Error(`PDF位置の議案IDが重複しています: ${location.itemId}`);
    const item = council.items.find((entry) => entry.id === location.itemId);
    if (!item || (location.pdfNumberRaw !== item.officialNumber.raw && location.pdfNumberRaw !== item.officialNumber.value)) {
      throw new Error(`PDF位置と議案番号が一致しません: ${location.itemId}`);
    }
    const rowCount = [15, 16, 16, 5][location.page - 1];
    if (!Number.isInteger(location.page) || !Number.isInteger(location.row) || !rowCount || location.row < 1 || location.row > rowCount) {
      throw new Error(`PDF位置のページまたは行が範囲外です: ${location.itemId}`);
    }
    byId.set(location.itemId, location);
  }
  if (byId.size !== council.items.length) throw new Error("PDF位置と議案の件数が一致しません");
  return byId;
}

export const pdfLocations = validatePdfLocations(locations);
