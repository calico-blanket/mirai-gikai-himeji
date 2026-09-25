import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseCouncilData } from "../lib/data/schema.ts";
import { checkVoteConsistency } from "../lib/data/vote-consistency.ts";

const council = parseCouncilData(JSON.parse(readFileSync("data/himeji-2025-4.json", "utf8")));
const candidate = JSON.parse(readFileSync("data/candidates/himeji-2025-4-vote-candidates.json", "utf8"));

test("保存済み52件はすべて賛成・反対の集計が議決結果と矛盾しない", () => {
  const results = checkVoteConsistency(council.items, candidate.votes);
  assert.equal(results.length, 52);
  assert.ok(results.every((row) => row.consistent), JSON.stringify(results.filter((row) => !row.consistent)));
});

test("可決なのに反対が賛成以上なら矛盾と判定する", () => {
  const votes = structuredClone(candidate.votes).map((vote) =>
    vote.itemId === "bill-137" ? { ...vote, position: { ...vote.position, value: "against" } } : vote);
  const results = checkVoteConsistency(council.items, votes);
  const bill137 = results.find((row) => row.itemId === "bill-137");
  assert.equal(bill137.consistent, false);
});

test("否決で反対が賛成以上なら矛盾ではない", () => {
  const memberBill7 = checkVoteConsistency(council.items, candidate.votes).find((row) => row.itemId === "member-bill-7");
  assert.equal(memberBill7.result, "rejected");
  assert.ok(memberBill7.againstCount >= memberBill7.forCount);
  assert.equal(memberBill7.consistent, true);
});

test("賛否候補が0件の議案は判定不能として矛盾扱いしない", () => {
  const results = checkVoteConsistency(council.items, []);
  assert.ok(results.every((row) => row.consistent));
  assert.ok(results.every((row) => row.forCount === 0 && row.againstCount === 0));
});
