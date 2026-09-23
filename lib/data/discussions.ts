import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import manifest from "../../data/candidates/himeji-2025-4-minutes-sources.json";
import candidate from "../../data/candidates/himeji-2025-4-discussions.json";
import { council } from "./council";
import { validateDiscussions } from "./discussion-validation";

const files = Object.fromEntries([manifest.indexSource, ...manifest.sources].map((source) => {
  const raw = readFileSync(`data/sources/${source.snapshotFile}`);
  return [source.snapshotFile, { sha256: createHash("sha256").update(raw).digest("hex"), payload: JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, "")) }];
}));
export const discussions = validateDiscussions(manifest, candidate, council.items.map((item) => item.id), files);
export function discussionsForId(itemId: string) {
  return discussions.rows.filter((row) => row.itemId === itemId);
}
