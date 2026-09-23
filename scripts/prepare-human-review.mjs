import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { candidateDigest } from "../lib/data/human-reviews.ts";

const data = JSON.parse(readFileSync("data/candidates/himeji-2025-4-vote-candidates.json", "utf8"));
const positions = JSON.parse(readFileSync("data/candidates/himeji-2025-4-vote-locations.json", "utf8"));
const pdfSha256 = createHash("sha256").update(readFileSync("data/sources/himeji-2025-4-votes.pdf")).digest("hex");
const sourceUrl = data.sources.find((source) => source.id === "himeji-32187-votes-pdf").url;
const ranges = [
  { id: "headers-page-1", kind: "headers", page: 1, columnStart: 1, columnEnd: 45 },
  ...[15, 16, 16, 5].map((rowEnd, index) => ({ id: `votes-page-${index + 1}`, kind: "votes", page: index + 1, rowStart: 1, rowEnd, columnStart: 1, columnEnd: 45 })),
];
const plan = ranges.map((range) => ({
  ...range,
  sourceUrl,
  pdfSha256,
  candidateSha256: candidateDigest(range, data, positions),
  reviewInstructions: range.kind === "headers"
    ? "PDFの1ページ目で、45列すべての議員名と会派見出しを確認してください。採決日の所属変更有無は別途調査が必要です。"
    : `PDFの${range.page}ページ目で、${range.rowStart}～${range.rowEnd}行・1～45列の原記号と候補をすべて確認してください。違いがあれば確認済みにしないでください。`,
  reviewer: "",
  checkedAt: "",
  decision: "未入力（確認後に verified または needs_correction）",
}));
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
