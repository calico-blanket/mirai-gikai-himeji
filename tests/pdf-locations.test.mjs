import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const locations = JSON.parse(readFileSync("data/candidates/himeji-2025-4-vote-locations.json", "utf8"));
const council = JSON.parse(readFileSync("data/himeji-2025-4.json", "utf8"));
const candidates = JSON.parse(readFileSync("data/candidates/himeji-2025-4-vote-candidates.json", "utf8"));
const csv = readFileSync("data/candidates/himeji-2025-4-vote-review.csv", "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);

test("PDFページ・行が52議案と全2,340票の照合用CSVに一致する", () => {
  assert.equal(locations.length, 52);
  assert.equal(new Set(locations.map((row) => row.itemId)).size, 52);
  const byId = new Map(locations.map((row) => [row.itemId, row]));
  assert.deepEqual(new Set(byId.keys()), new Set(council.items.map((item) => item.id)));
  for (const item of council.items) {
    const location = byId.get(item.id);
    assert.ok([item.officialNumber.raw, item.officialNumber.value].includes(location.pdfNumberRaw));
    assert.ok(Number.isInteger(location.page) && location.page >= 1 && location.page <= 4);
    assert.ok(Number.isInteger(location.row) && location.row >= 1 && location.row <= [15, 16, 16, 5][location.page - 1]);
  }
  assert.equal(csv.length - 1, 2340);
  for (const line of csv.slice(1)) {
    const [itemId, pdfNumberRaw, page, row] = line.split(",", 5);
    const location = byId.get(itemId);
    assert.deepEqual([pdfNumberRaw, Number(page), Number(row)], [location.pdfNumberRaw, location.page, location.row]);
  }
});

test("議案本文の原文照合が進んでも、賛否候補はすべて未確認のまま", () => {
  assert.ok(council.items.some((item) => item.reviewStatus === "verified"));
  assert.ok(candidates.votes.every((vote) => vote.reviewStatus === "unreviewed"));
  assert.ok(candidates.members.every((member) => member.reviewStatus === "unreviewed"));
  assert.ok(candidates.memberships.every((membership) => membership.reviewStatus === "unreviewed"));
});
