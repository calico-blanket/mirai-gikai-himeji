import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseCouncilData, parsePublishableCouncilData } from "../lib/data/schema.ts";
import { assertCandidateReadyForDisplay } from "../lib/data/candidate-validation.ts";

const candidate = JSON.parse(readFileSync("data/candidates/himeji-2025-4-vote-candidates.json", "utf8"));
const displayed = JSON.parse(readFileSync("data/himeji-2025-4.json", "utf8"));

test("PDF候補の件数・ID・所属参照を既存スキーマで検証する", () => {
  const data = parseCouncilData(candidate);
  assert.equal(data.items.length, 52);
  assert.equal(data.members.length, 45);
  assert.equal(data.factions.length, 11);
  assert.equal(data.memberships.length, 45);
  assert.equal(data.votes.length, 52 * 45);
  assert.equal(data.votes.filter((row) => row.position.value === "chair_not_voting").length, 52);
  assert.ok(data.votes.every((row) => row.reviewStatus === "unreviewed"));
  assert.throws(() => parsePublishableCouncilData(candidate));
});

test("画面ではHTML議案とPDF候補を別々に読み、議案135号の確認記録を維持する", () => {
  const data = parseCouncilData(displayed);
  assert.equal(data.votes.length, 0);
  assert.equal(data.members.length, 0);
  assert.deepEqual(candidate.items, data.items);
  assert.equal(data.items.find((item) => item.id === "bill-135").reviewStatus, "verified");
  assert.equal(candidate.votes.filter((vote) => vote.itemId === "bill-135").length, 45);
  assert.equal(candidate.votes.find((vote) => vote.itemId === "bill-135").reviewStatus, "unreviewed");
  assert.equal(candidate.memberships.filter((row) => row.factionId.value === "pdf-faction-01").length, 8);
  assert.match(assertCandidateReadyForDisplay(parseCouncilData(candidate), data).url, /\.pdf$/);
});

test("票の欠落と候補の誤った確認済み化を画面用の読込口が拒否する", () => {
  const missing = structuredClone(candidate);
  missing.votes.pop();
  missing.counts.votes--;
  assert.doesNotThrow(() => parseCouncilData(missing));
  assert.throws(() => assertCandidateReadyForDisplay(parseCouncilData(missing), parseCouncilData(displayed)), /件数/);

  const premature = structuredClone(candidate);
  premature.votes[0].reviewStatus = "verified";
  assert.throws(() => assertCandidateReadyForDisplay(parseCouncilData(premature), parseCouncilData(displayed)), /未確認以外/);
});
