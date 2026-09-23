import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadInputs } from "./classify-himeji-topics.mjs";
import { validateDiscussions } from "../lib/data/discussion-validation.ts";
import { validateExplanations } from "../lib/data/explanation-validation.ts";
import { childExplanationDrafts } from "../lib/data/child-explanations.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = async (name) => JSON.parse((await readFile(resolve(root, name), "utf8")).replace(/^\uFEFF/, ""));
export async function loadContentTargets() {
  const inputs = await loadInputs();
  const manifest = await read("data/candidates/himeji-2025-4-minutes-sources.json");
  const files = Object.fromEntries(await Promise.all([manifest.indexSource, ...manifest.sources].map(async (source) => {
    if (!/^himeji-2025-4-minutes-(?:index|\d+)\.json$/.test(source.snapshotFile)) throw new Error("原資料パスが不正です");
    const raw = await readFile(resolve(root, "data/sources", source.snapshotFile));
    return [source.snapshotFile, { sha256: createHash("sha256").update(raw).digest("hex"), payload: JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, "")) }];
  })));
  const discussions = validateDiscussions(manifest, await read("data/candidates/himeji-2025-4-discussions.json"), inputs.map((row) => row.itemId), files);
  const explanations = validateExplanations(await read("data/candidates/himeji-2025-4-explanations.json"), inputs, await read("data/editorial/himeji-2025-4-explanation-drafts.json"));
  const childExplanations = validateExplanations(await read("data/candidates/himeji-2025-4-child-explanations.json"), inputs, childExplanationDrafts(await read("data/editorial/himeji-2025-4-child-explanation-texts.json"), await read("data/editorial/himeji-2025-4-explanation-drafts.json")));
  return { explanations, childExplanations, discussions: new Map(discussions.rows.map((row) => [row.id, row])) };
}
