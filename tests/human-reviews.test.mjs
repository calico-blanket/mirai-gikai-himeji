import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { candidateDigest, reviewedVoteIds, validateHumanReviews, voteIdsForDecision } from "../lib/data/human-reviews.ts";

const data = JSON.parse(readFileSync("data/candidates/himeji-2025-4-vote-candidates.json", "utf8"));
const positions = JSON.parse(readFileSync("data/candidates/himeji-2025-4-vote-locations.json", "utf8"));
const pdfSha256 = createHash("sha256").update(readFileSync("data/sources/himeji-2025-4-votes.pdf")).digest("hex");
const sourceUrl = data.sources.find((source) => source.id === "himeji-32187-votes-pdf").url;
const saved = JSON.parse(readFileSync("data/candidates/himeji-2025-4-human-reviews.json", "utf8"));

function example(overrides = {}) {
  const range = { kind: "votes", page: 1, rowStart: 1, rowEnd: 1, columnStart: 1, columnEnd: 2 };
  return {
    id: "example", ...range, sourceUrl, pdfSha256,
    candidateSha256: candidateDigest(range, data, positions),
    reviewer: "test reviewer", checkedAt: "2026-09-22T09:00:00Z", decision: "verified", ...overrides,
  };
}

test("保存済み記録は空で、既存の票を一件も確認済みにしない", () => {
  const records = validateHumanReviews(saved, data, positions, pdfSha256, sourceUrl);
  assert.equal(records.length, 0);
  assert.equal(reviewedVoteIds(records, data, positions).size, 0);
  assert.equal(data.votes.filter((vote) => vote.reviewStatus === "verified").length, 0);
});

test("指定したPDFの2セルだけを確認済みとして投影する", () => {
  const records = validateHumanReviews([example()], data, positions, pdfSha256, sourceUrl);
  assert.deepEqual([...reviewedVoteIds(records, data, positions)].sort(), ["vote-bill-135-01", "vote-bill-135-02"]);
  const correction = validateHumanReviews([example({ decision: "needs_correction", note: "原記号が異なる" })], data, positions, pdfSha256, sourceUrl);
  assert.equal(reviewedVoteIds(correction, data, positions).size, 0);
  assert.equal(voteIdsForDecision(correction, data, positions, "needs_correction").size, 2);
});

test("PDF差し替え、候補改変、重複範囲、範囲外、署名不足を拒否する", () => {
  assert.throws(() => validateHumanReviews([example({ pdfSha256: "0".repeat(64) })], data, positions, pdfSha256, sourceUrl), /原PDF/);
  const changed = structuredClone(data);
  changed.votes[0].position.raw = "✕";
  assert.throws(() => validateHumanReviews([example()], changed, positions, pdfSha256, sourceUrl), /候補データ/);
  assert.throws(() => validateHumanReviews([example(), example({ id: "second" })], data, positions, pdfSha256, sourceUrl), /重複/);
  assert.throws(() => validateHumanReviews([example({ rowEnd: 16 })], data, positions, pdfSha256, sourceUrl), /行範囲/);
  assert.throws(() => validateHumanReviews([example({ reviewer: "" })], data, positions, pdfSha256, sourceUrl));
  assert.throws(() => validateHumanReviews([example({ decision: "needs_correction" })], data, positions, pdfSha256, sourceUrl));
});
