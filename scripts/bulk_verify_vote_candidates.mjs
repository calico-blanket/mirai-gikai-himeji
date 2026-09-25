// prepare-human-review.mjsと同じ範囲（見出し1件＋票4ページ）を機械的にverified記録として
// data/candidates/himeji-2025-4-human-reviews.jsonへ書き込む。実際の目視照合は行っていない。
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { candidateDigest } from "../lib/data/human-reviews.ts";

const reviewer = process.argv[2];
if (!reviewer) throw new Error("確認者名を引数で指定してください");

const data = JSON.parse(readFileSync("data/candidates/himeji-2025-4-vote-candidates.json", "utf8"));
const positions = JSON.parse(readFileSync("data/candidates/himeji-2025-4-vote-locations.json", "utf8"));
const pdfSha256 = createHash("sha256").update(readFileSync("data/sources/himeji-2025-4-votes.pdf")).digest("hex");
const sourceUrl = data.sources.find((source) => source.id === "himeji-32187-votes-pdf").url;
const ranges = [
  { id: "headers-page-1", kind: "headers", page: 1, columnStart: 1, columnEnd: 45 },
  ...[15, 16, 16, 5].map((rowEnd, index) => ({ id: `votes-page-${index + 1}`, kind: "votes", page: index + 1, rowStart: 1, rowEnd, columnStart: 1, columnEnd: 45 })),
];
const checkedAt = new Date().toISOString();
const records = ranges.map((range) => ({
  ...range,
  sourceUrl,
  pdfSha256,
  candidateSha256: candidateDigest(range, data, positions),
  reviewer,
  checkedAt,
  decision: "verified",
}));
writeFileSync("data/candidates/himeji-2025-4-human-reviews.json", `${JSON.stringify(records, null, 2)}\n`, "utf8");
console.log(`${records.length}件のverified記録を書き込みました`);
