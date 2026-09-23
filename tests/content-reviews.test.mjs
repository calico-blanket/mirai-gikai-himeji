import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadContentTargets } from "../scripts/load-content-targets.mjs";
import { importContentReviews } from "../scripts/import-content-reviews.mjs";
import { appendContentReviews, validateContentReviews, contentDigest, explanationDisplay, discussionNeedsCorrection } from "../lib/data/content-reviews.ts";
import { billFilterQuery, readBillFilters, billListReturn } from "../lib/bill-search.ts";

const targets = await loadContentTargets();
const empty = { schemaVersion: 1, kind: "content_reviews", sessionId: "himeji-2025-4", records: [] };
const file = (...records) => ({ ...empty, records });
function row(kind = "explanation", targetId = "bill-135", extra = {}) {
  const candidate = (kind === "explanation" ? targets.explanations : targets.discussions).get(targetId);
  return { id: randomUUID(), kind, targetId, candidateSha256: contentDigest(candidate), supersedes: null,
    reviewer: "テスト専用", reviewedAt: new Date().toISOString(), note: "テスト内だけの確認。実際の確認ではありません。",
    originalTextChecked: true, meaningChecked: true, decision: "confirmed", ...extra };
}
test("説明52件・対応72件を検証し、人の確認は対象1件だけに適用する", () => {
  assert.equal(targets.explanations.size, 52); assert.equal(targets.discussions.size, 72);
  const candidate = targets.explanations.get("bill-135"), before = JSON.stringify(candidate);
  const checked = validateContentReviews(appendContentReviews(empty, file(row()), targets), targets);
  assert.equal(checked.active.size, 1);
  assert.equal(explanationDisplay(candidate, checked.active).review.decision, "confirmed");
  assert.equal(explanationDisplay(targets.explanations.get("bill-139"), checked.active).review, undefined);
  assert.equal(JSON.stringify(candidate), before); assert.equal(candidate.reviewStatus, "unreviewed");
});
test("原文だけの確認・虚偽参照・重複・未来日時・未取得根拠を拒否する", () => {
  for (const bad of [row("explanation", "bill-135", {meaningChecked:false}), row("explanation", "bill-135", {originalTextChecked:false}), row("explanation", "bill-135", {targetId:"bill-999"}), row("explanation", "bill-135", {reviewedAt:"2099-01-01T00:00:00Z"}), row("explanation", "bill-135", {reviewedAt:"2020-01-01T00:00:00Z"}), row("explanation", "member-bill-7", {decision:"corrected", replacement:[{text:"テスト",evidenceIds:["proposal"]}]})]) assert.throws(() => appendContentReviews(empty, file(bad), targets));
  const good = row(); assert.throws(() => appendContentReviews(empty, file(good, good), targets));
  assert.throws(() => appendContentReviews(empty, empty, targets));
  assert.throws(() => appendContentReviews(empty, file(row("explanation", "bill-135", {decision:"corrected", replacement:targets.explanations.get("bill-135").statements})), targets));
});
test("訂正・保留は履歴を残し、競合更新と古い対象への確認を拒否する", () => {
  const first = row(), ledger = appendContentReviews(empty, file(first), targets);
  const next = row("explanation", "bill-135", {supersedes:first.id, decision:"corrected", replacement:[{text:"テスト用の訂正文",evidenceIds:["title"]}]});
  const result = appendContentReviews(ledger, file(next), targets);
  assert.equal(result.records.length, 2); assert.equal(result.records[0].id, first.id);
  assert.equal(explanationDisplay(targets.explanations.get("bill-135"), validateContentReviews(result, targets).active).statements[0].text, "テスト用の訂正文");
  assert.throws(() => appendContentReviews(result, file(row()), targets));
  const changed = structuredClone(targets); changed.explanations.get("bill-135").statements[0].text += "更新";
  assert.equal(validateContentReviews(result, changed).stale.size, 1);
  assert.equal(validateContentReviews(result, changed).active.size, 0);
  assert.throws(() => appendContentReviews(empty, file(first), changed));
});
test("対応を保留・除外すると依存する説明を止め、別の根拠による訂正は表示できる", () => {
  const candidate = targets.explanations.get("bill-135"), id = candidate.input.proposal.associationId;
  for (const decision of ["withheld", "rejected"]) {
    const active = validateContentReviews(file(row("discussion", id, {decision, meaningChecked:false})), targets).active;
    assert.equal(discussionNeedsCorrection(id, active), true);
    assert.equal(explanationDisplay(candidate, active).hidden, true);
    assert.deepEqual(explanationDisplay(candidate, active).statements, []);
    const correction = row("explanation", "bill-135", {decision:"corrected",replacement:[{text:"別根拠によるテスト用訂正",evidenceIds:["title"]}]});
    active.set("explanation:bill-135", correction);
    assert.equal(explanationDisplay(candidate, active).hidden, false);
  }
  assert.throws(() => appendContentReviews(empty, file(row("discussion", id, {replacement:[{text:"原文改変", evidenceIds:["title"]}]})), targets));
});
test("実ファイルで事前検証・バックアップ付き反映・失敗時の保持・ロックを確認する", async () => {
  const dir = await mkdtemp(join(tmpdir(), "himeji-content-test-"));
  const ledgerPath=join(dir,"ledger.json"), incomingPath=join(dir,"incoming.json");
  try {
    await writeFile(ledgerPath, JSON.stringify(empty)); await writeFile(incomingPath, JSON.stringify(file(row())));
    const options={ledgerPath,incomingPath,targets}; await importContentReviews(options);
    assert.equal((JSON.parse(await readFile(ledgerPath,"utf8"))).records.length,0);
    await importContentReviews({...options,apply:true}); const saved=await readFile(ledgerPath,"utf8");
    assert.equal(JSON.parse(saved).records.length,1);
    const backups=(await readdir(dir)).filter(name=>name.endsWith(".backup")); assert.equal(backups.length,1);
    assert.deepEqual(JSON.parse(await readFile(join(dir,backups[0]),"utf8")),empty);
    await assert.rejects(importContentReviews({...options,apply:true})); assert.equal(await readFile(ledgerPath,"utf8"),saved);
    await writeFile(ledgerPath+".lock", "locked"); await assert.rejects(importContentReviews(options));
    assert.equal(await readFile(ledgerPath,"utf8"),saved);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test("検索条件を日本語で復元し、戻り先に外部URLや不明パラメーターを使わない", () => {
  const filters={query:"子ども & 135",kind:"議案",result:"原案可決",topic:"finance"};
  const query=billFilterQuery(filters); assert.deepEqual(readBillFilters(query),filters);
  assert.equal(billListReturn("?list="+encodeURIComponent(query)),"/gians?"+query);
  assert.equal(billListReturn("?list="+encodeURIComponent("https://example.com")),"/gians");
  assert.equal(billListReturn("?list="+encodeURIComponent("redirect=https://example.com&q=135")),"/gians?q=135");
  assert.equal(readBillFilters("q="+"a".repeat(300)).query.length,200);
});
