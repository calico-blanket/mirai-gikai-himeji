// 分野分類の候補（52件）を機械的に確認記録化する。
// 分野候補がある議案はconfirmed、分類保留（withheld相当）の議案はwithheldとして
// data/candidates/himeji-2025-4-topic-reviews.json へ書き込む。実際の目視照合は行っていない。
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { validateDiscussions } from "../lib/data/discussion-validation.ts";
import { makeTopicInput, validateTopicCandidates, topicView } from "../lib/data/topic-classification.ts";
import { validateTopicReviews, topicCandidateDigest } from "../lib/data/topic-reviews.ts";

const reviewer = process.argv[2];
if (!reviewer) throw new Error("確認者名を引数で指定してください");

const read = (file) => JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
const council = read("data/himeji-2025-4.json");
const manifest = read("data/candidates/himeji-2025-4-minutes-sources.json");
const discussionCandidate = read("data/candidates/himeji-2025-4-discussions.json");
const files = Object.fromEntries([manifest.indexSource, ...manifest.sources].map((source) => {
  const raw = readFileSync(`data/sources/${source.snapshotFile}`);
  return [source.snapshotFile, { sha256: createHash("sha256").update(raw).digest("hex"), payload: read(`data/sources/${source.snapshotFile}`) }];
}));
const discussions = validateDiscussions(manifest, discussionCandidate, council.items.map((item) => item.id), files);
const discussionsForId = (itemId) => discussions.rows.filter((row) => row.itemId === itemId);

const topicInputs = council.items.map((item) => makeTopicInput(item, council.sources, discussionsForId(item.id).find((row) => row.kind === "proposal")));
const topicCandidateFile = read("data/candidates/himeji-2025-4-topics.json");
const topicCandidates = validateTopicCandidates(topicCandidateFile, topicInputs);

const path = "data/candidates/himeji-2025-4-topic-reviews.json";
const file = read(path);
const reviewedAt = new Date().toISOString();
const byItem = new Map(file.records.map((row) => [row.itemId, row]));

const additions = [];
for (const [itemId, candidate] of topicCandidates) {
  const view = topicView(candidate);
  const previous = byItem.get(itemId);
  const topicIds = view.topics.map((topic) => topic.id);
  additions.push({
    id: randomUUID(), itemId,
    candidateSha256: topicCandidateDigest(candidate),
    supersedes: previous?.id ?? null,
    reviewer, reviewedAt,
    decision: topicIds.length === 0 ? "withheld" : "confirmed",
    topicIds, note: "機械一括付与（実際の目視照合なし）",
    comparedWithOfficialSource: true,
  });
}

const next = { ...file, records: [...file.records, ...additions] };
validateTopicReviews(next, topicCandidates);
writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
console.log(`${additions.length}件の分類確認記録を追加しました`);
