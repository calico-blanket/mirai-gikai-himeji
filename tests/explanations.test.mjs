import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { loadInputs } from "../scripts/classify-himeji-topics.mjs";
import { validateExplanations, explanationEvidence, explanationReviewReasons, createExplanationCandidates } from "../lib/data/explanation-validation.ts";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const inputs = await loadInputs();
const drafts = read("data/editorial/himeji-2025-4-explanation-drafts.json");
const snapshotPath = "data/candidates/himeji-2025-4-explanations.json";
const snapshot = read(snapshotPath);
const records = validateExplanations(snapshot, inputs, drafts);

test("52件の説明案を議案・原文・出典に結び付け、全て未確認として読み込む", () => {
  assert.equal(records.size, 52);
  assert.deepEqual([...records.keys()].sort(), inputs.map((row) => row.itemId).sort());
  for (const record of records.values()) {
    assert.equal(record.authoring, "assistant_draft"); assert.equal(record.reviewStatus, "unreviewed");
    for (const statement of record.statements) for (const id of statement.evidenceIds) {
      const evidence = explanationEvidence(record.input, id);
      assert.ok(evidence.raw); assert.ok(evidence.sourceUrl.startsWith("https://")); assert.ok(evidence.retrievedAt);
    }
  }
  assert.equal([...records.values()].filter((row) => row.statements.some((s) => s.evidenceIds.includes("proposal"))).length, 5);
});

test("欠落・重複・別議案参照・verified・余分な項目を拒否する", () => {
  for (const mutate of [
    (file) => file.records.pop(),
    (file) => { file.records[1] = structuredClone(file.records[0]); },
    (file) => { file.records[0].itemId = "bill-999"; },
    (file) => { file.records[0].input.itemId = "bill-139"; },
    (file) => { file.records[0].reviewStatus = "verified"; },
    (file) => { file.records[0].approved = true; },
  ]) { const broken = structuredClone(snapshot); mutate(broken); assert.throws(() => validateExplanations(broken, inputs, drafts)); }
  assert.throws(() => createExplanationCandidates([...drafts, drafts[0]], inputs, new Date().toISOString()));
});

test("原文・出典・取得日・会議録の対応の変更や説明の保存漏れを検出する", () => {
  for (const mutate of [
    (row) => { row.fields[1].raw += "改訂"; },
    (row) => { row.fields[1].sourceUrl += "#revised"; },
    (row) => { row.fields[1].retrievedAt = "2026-09-24T00:00:00Z"; },
    (row) => { row.proposal.associationId += "-changed"; },
  ]) {
    const changed = structuredClone(inputs); mutate(changed.find((row) => row.itemId === "bill-135"));
    assert.throws(() => validateExplanations(snapshot, changed, drafts), /更新/);
  }
  const altered = structuredClone(snapshot); altered.records[0].input.proposal.raw += "捏造";
  assert.throws(() => validateExplanations(altered, inputs, drafts), /更新/);
  const edited = structuredClone(drafts); edited[0].statements[0].text += "変更";
  assert.throws(() => validateExplanations(snapshot, inputs, edited), /説明案が更新/);
});

test("未取得資料を根拠とする説明・根拠なし・重複参照を拒否する", () => {
  for (const evidenceIds of [["officialSummary"], ["proposal"], [], ["title", "title"], ["result"]]) {
    const edited = structuredClone(drafts);
    edited.find((row) => row.itemId === "member-bill-7").statements[0].evidenceIds = evidenceIds;
    assert.throws(() => createExplanationCandidates(edited, inputs, new Date().toISOString()));
  }
});

test("条件や欠測を省略せず、字体の違い・解釈注意を確認対象に含める", () => {
  const museum = records.get("bill-143").statements.map((row) => row.text).join("");
  assert.match(museum, /最初の3月31日/); assert.match(museum, /20人以上から30人以上/);
  assert.ok(explanationReviewReasons(records.get("bill-147")).some((reason) => reason.includes("引き下げる")));
  assert.ok(explanationReviewReasons(records.get("member-bill-7")).some((reason) => reason.includes("正式名称のみ")));
  assert.match(records.get("inquiry-11").statements[0].text, /髙馬朗/);
  for (const id of ["bill-138", "bill-141", "bill-142"]) assert.match(records.get(id).statements[0].text, /結果を把握している場合/);
  const council = read("data/himeji-2025-4.json");
  assert.deepEqual(council.items.filter((row) => row.reviewStatus === "verified").map((row) => row.id), ["bill-135"]);
});

test("事前確認はAPIキーなしで動作し、保存済み説明を変更しない", () => {
  const before = readFileSync(snapshotPath, "utf8");
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/prepare-bill-explanations.mjs"], { encoding: "utf8", env: { ...process.env, TYPESAFE_API_KEY: "" } });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /52件/);
  assert.equal(readFileSync(snapshotPath, "utf8"), before);
});
