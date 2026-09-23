import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pages from "../../data/candidates/himeji-2025-4-bill-pages.json";
import { billDocumentForId } from "./bill-document";
import { validateBillPages } from "./bill-page-validation";
import { council } from "./council";

const pageCounts: Record<string, number> = {
  "R7-4_hoseiyosan_gian135-136.pdf": 29,
  "R7-4_gian137-163_hokoku25-28.pdf": 44,
  "R7-4_hoseiyosan_gian164-166.pdf": 91,
  "R7-4_gian167-173_shimon1-12.pdf": 43,
};
const hashes = Object.fromEntries(Object.entries(pageCounts).map(([file, count]) => [file, {
  pages: count,
  sha256: createHash("sha256").update(readFileSync(`data/sources/${file}`)).digest("hex"),
}]));

const byId = validateBillPages(pages, council.items, billDocumentForId, hashes);

export function billPageForId(itemId: string) {
  return byId.get(itemId) ?? null;
}
