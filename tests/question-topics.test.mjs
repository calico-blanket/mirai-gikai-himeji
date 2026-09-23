import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateQuestionTopics } from "../lib/data/question-topic-validation.ts";

const rows = JSON.parse(readFileSync("data/candidates/himeji-2025-4-question-topics.json", "utf8"));
const items = JSON.parse(readFileSync("data/himeji-2025-4.json", "utf8")).items;
const sha256 = createHash("sha256").update(readFileSync("data/sources/himeji-2025-4-questions.html")).digest("hex");

test("対象会期の質問一覧で番号が明記された135号と154号だけを候補にする", () => {
  const byId = validateQuestionTopics(rows, items.map((item) => item.id), sha256);
  assert.deepEqual([...byId.keys()], ["bill-135", "bill-154"]);
  assert.ok(rows.every((row) => row.reviewStatus === "unreviewed"));
});

test("番号の推測補完、出典差し替え、確認済みへの変更を拒否する", () => {
  const guessed = structuredClone(rows);
  guessed[0].itemId = "bill-136";
  assert.throws(() => validateQuestionTopics(guessed, items.map((item) => item.id), sha256), /議案番号/);
  assert.throws(() => validateQuestionTopics(rows, items.map((item) => item.id), "0".repeat(64)), /版/);
  const premature = structuredClone(rows);
  premature[0].reviewStatus = "verified";
  assert.throws(() => validateQuestionTopics(premature, items.map((item) => item.id), sha256));
});
