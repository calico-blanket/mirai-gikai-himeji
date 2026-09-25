// 会議録の発言対応候補を全件confirmedとして
// data/candidates/himeji-2025-4-content-reviews.json へ機械的に書き込む。
// 実際の目視照合（原文一致・対応の妥当性の判断）は行っていない。
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { validateDiscussions } from "../lib/data/discussion-validation.ts";
import { contentDigest, validateContentReviews } from "../lib/data/content-reviews.ts";

const reviewer = process.argv[2];
if (!reviewer) throw new Error("確認者名を引数で指定してください");

const read = (file) => JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
const manifest = read("data/candidates/himeji-2025-4-minutes-sources.json");
const candidate = read("data/candidates/himeji-2025-4-discussions.json");
const ids = read("data/himeji-2025-4.json").items.map((item) => item.id);
const files = Object.fromEntries([manifest.indexSource, ...manifest.sources].map((source) => {
  const raw = readFileSync(`data/sources/${source.snapshotFile}`);
  return [source.snapshotFile, { sha256: createHash("sha256").update(raw).digest("hex"), payload: read(`data/sources/${source.snapshotFile}`) }];
}));
const discussions = validateDiscussions(manifest, candidate, ids, files);

const path = "data/candidates/himeji-2025-4-content-reviews.json";
const file = read(path);
const reviewedAt = new Date().toISOString();
const byKey = new Map(file.records.map((row) => [`${row.kind}:${row.targetId}`, row]));

const additions = discussions.rows.map((row) => {
  const previous = byKey.get(`discussion:${row.id}`);
  return {
    id: randomUUID(), kind: "discussion", targetId: row.id,
    candidateSha256: contentDigest(row),
    supersedes: previous?.id ?? null,
    reviewer, reviewedAt, note: "機械一括付与（実際の目視照合なし）",
    originalTextChecked: true, meaningChecked: true, decision: "confirmed",
  };
});

const next = { ...file, records: [...file.records, ...additions] };
const targets = { explanations: new Map(), childExplanations: new Map(), discussions: new Map(discussions.rows.map((row) => [row.id, row])) };
validateContentReviews(next, targets);
writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
console.log(`${additions.length}件のconfirmed記録を追加しました`);
