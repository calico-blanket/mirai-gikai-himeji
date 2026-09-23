import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { validateTopicCandidates, topicView } from "../lib/data/topic-classification.ts";
import { topicCandidateDigest, validateTopicReviews, appendTopicReviews, reviewedTopicView } from "../lib/data/topic-reviews.ts";
import { loadInputs } from "../scripts/classify-himeji-topics.mjs";
import { importTopicReviews } from "../scripts/import-topic-reviews.mjs";

const inputs = await loadInputs();
const rawCandidates = JSON.parse(await readFile("data/candidates/himeji-2025-4-topics.json", "utf8"));
const candidates = validateTopicCandidates(rawCandidates, inputs);
const candidate = candidates.get("bill-140");
const file = (records = []) => ({ schemaVersion: 1, sessionId: "himeji-2025-4", records });
const row = (overrides = {}) => ({ id: randomUUID(), itemId: candidate.itemId, candidateSha256: topicCandidateDigest(candidate), supersedes: null, reviewer: "テスト専用・公開しない", reviewedAt: new Date().toISOString(), decision: "confirmed", topicIds: topicView(candidate).topics.map((topic) => topic.id), note: "テスト用の判断記録。実際の人の確認ではない。", comparedWithOfficialSource: true, ...overrides });

test("分類確認は対象1件だけに適用し、元候補・議案・票の確認状態を変えない", () => {
  const before = JSON.stringify(rawCandidates);
  const review = row();
  const state = validateTopicReviews(appendTopicReviews(file(), file([review]), candidates), candidates);
  assert.equal(state.active.size, 1);
  assert.equal(state.active.has("bill-135"), false);
  assert.equal(reviewedTopicView(candidate, review).review.decision, "confirmed");
  assert.equal(candidate.reviewStatus, "unreviewed");
  assert.equal(JSON.stringify(rawCandidates), before);
});

test("重複、無根拠の確認、未知分野・議案、日付・宣言・確認者不足を拒否", () => {
  for (const overrides of [
    { reviewer: " " }, { note: " " }, { comparedWithOfficialSource: false },
    { itemId: "bill-999" }, { topicIds: ["fake"] }, { topicIds: ["finance", "finance"] },
    { decision: "verified" }, { decision: "confirmed", topicIds: ["finance"] },
    { decision: "corrected" }, { decision: "withheld" },
    { reviewedAt: "2020-01-01T00:00:00Z" }, { reviewedAt: "2099-01-01T00:00:00Z" },
    { supersedes: randomUUID() }, { candidateSha256: "0".repeat(64) },
  ]) assert.throws(() => appendTopicReviews(file(), file([row(overrides)]), candidates));
  const review = row();
  assert.throws(() => appendTopicReviews(file([review]), file([review]), candidates), /重複/);
  assert.throws(() => appendTopicReviews(file(), file(), candidates), /ありません/);
});

test("修正・保留を反映し、前の記録を保持して競合更新を拒否する", () => {
  const first = row();
  const correction = row({ supersedes: first.id, decision: "corrected", topicIds: ["health_welfare"] });
  const revised = appendTopicReviews(file([first]), file([correction]), candidates);
  assert.equal(revised.records.length, 2);
  assert.deepEqual(reviewedTopicView(candidate, validateTopicReviews(revised, candidates).active.get(candidate.itemId)).topics.map((topic) => topic.id), ["health_welfare"]);
  const hold = row({ supersedes: correction.id, decision: "withheld", topicIds: [] });
  assert.equal(reviewedTopicView(candidate, validateTopicReviews(appendTopicReviews(revised, file([hold]), candidates), candidates).active.get(candidate.itemId)).state, "withheld");
  assert.throws(() => appendTopicReviews(revised, file([row({ supersedes: first.id })]), candidates), /競合/);
});

test("原文・出典・判定値・生成日時・モデル版変更で確認を無効化し、古い画面の取り込みを拒否", () => {
  const review = row();
  for (const mutate of [
    (record) => { record.input.fields[1].raw += "改訂"; },
    (record) => { record.input.fields[1].retrievedAt = "2026-09-23T00:00:00Z"; },
    (record) => { record.response.answers.finance.noul = 0.61; },
    (record) => { record.generatedAt = new Date().toISOString(); },
    (record) => { record.promptVersion = "2"; },
  ]) {
    const changed = structuredClone(candidate); mutate(changed);
    const current = new Map(candidates); current.set(candidate.itemId, changed);
    const result = validateTopicReviews(file([review]), current);
    assert.equal(result.active.size, 0); assert.equal(result.stale.size, 1);
    assert.equal(reviewedTopicView(changed, result.active.get(candidate.itemId)).review, undefined);
    assert.throws(() => appendTopicReviews(file(), file([review]), current), /更新/);
  }
});

test("実ファイルでdry-run・追記・失敗時の保持・ロック競合を検証する（本番台帳は変更しない）", async () => {
  const directory = await mkdtemp(join(tmpdir(), "himeji-topic-review-"));
  const ledgerPath = join(directory, "reviews.json"), candidatePath = join(directory, "candidates.json"), incomingPath = join(directory, "incoming.json");
  try {
    await writeFile(ledgerPath, JSON.stringify(file()));
    await writeFile(candidatePath, JSON.stringify(rawCandidates));
    await writeFile(incomingPath, JSON.stringify(file([row()])));
    const options = { ledgerPath, candidatePath, incomingPath, inputs };
    const before = await readFile(ledgerPath, "utf8");
    await importTopicReviews(options);
    assert.equal(await readFile(ledgerPath, "utf8"), before);
    await importTopicReviews({ ...options, apply: true });
    const after = await readFile(ledgerPath, "utf8");
    assert.equal(JSON.parse(after).records.length, 1);
    await assert.rejects(importTopicReviews({ ...options, apply: true }), /重複/);
    assert.equal(await readFile(ledgerPath, "utf8"), after);
    await writeFile(ledgerPath + ".lock", "");
    await assert.rejects(importTopicReviews({ ...options, apply: true }), /EEXIST/);
    assert.equal(await readFile(ledgerPath, "utf8"), after);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
