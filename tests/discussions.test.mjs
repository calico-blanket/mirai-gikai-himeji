import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateDiscussions } from "../lib/data/discussion-validation.ts";

const read = (file) => JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const manifest = read("data/candidates/himeji-2025-4-minutes-sources.json");
const candidate = read("data/candidates/himeji-2025-4-discussions.json");
const ids = read("data/himeji-2025-4.json").items.map((item) => item.id);
const files = Object.fromEntries([manifest.indexSource, ...manifest.sources].map((source) => {
  const raw = readFileSync(`data/sources/${source.snapshotFile}`);
  return [source.snapshotFile, { sha256: createHash("sha256").update(raw).digest("hex"), payload: read(`data/sources/${source.snapshotFile}`) }];
}));
const validate = (value = candidate, sources = manifest, input = files) => validateDiscussions(sources, value, ids, input);

test("本会議5日661発言・51案件72対応候補を原文・出典付きで検証する", () => {
  const result = validate();
  assert.equal(result.speechCount, 661);
  assert.equal(result.rows.length, 72);
  assert.equal(new Set(result.rows.map((row) => row.itemId)).size, 51);
  assert.equal(result.rows.filter((row) => row.kind === "proposal").length, 51);
  assert.ok(result.rows.every((row) => row.reviewStatus === "unreviewed"));
  assert.ok(!result.rows.some((row) => row.itemId === "member-bill-7"));
});

test("過年度172号への言及・関連138号の言及を別の提案説明にしない", () => {
  const result = validate();
  assert.ok(!result.rows.some((row) => row.itemId === "bill-172" && row.recordId === "2417"));
  assert.equal(result.rows.filter((row) => row.itemId === "bill-138" && row.kind === "proposal").length, 1);
  const forged = structuredClone(candidate);
  const row = forged.rows.find((entry) => entry.itemId === "bill-163" && entry.kind === "proposal");
  row.itemId = "bill-172";
  row.id = `${row.recordId}-${row.speechId}-${row.itemId}`;
  assert.throws(() => validate(forged), /段落先頭/);
});

test("135号への答弁は項目番号の根拠を持つ1件に限定し他の話題を含めない", () => {
  const rows = validate().rows;
  assert.deepEqual(rows.filter((row) => row.itemId === "bill-135" && row.kind === "answer").map((row) => row.speechId), ["202111"]);
  assert.ok(!rows.some((row) => ["202107", "202109", "202113"].includes(row.speechId)));
  const missing = structuredClone(candidate);
  missing.rows.find((row) => row.method === "contextual_answer").evidence.pop();
  assert.throws(() => validate(missing), /対応根拠/);
});

test("原文改変・不正参照・重複・先行したverifiedを拒否する", () => {
  for (const mutation of [
    (value) => { value.rows[0].excerptRaw += "架空の説明"; },
    (value) => { value.rows[0].speechId = "999999"; value.rows[0].id = `${value.rows[0].recordId}-999999-${value.rows[0].itemId}`; },
    (value) => { value.rows.push(value.rows[0]); },
    (value) => { value.rows[0].reviewStatus = "verified"; },
    (value) => { value.rows[0].paragraphIndexes = [999999]; },
    (value) => { value.rows[0].itemId = "nonexistent"; },
  ]) {
    const invalid = structuredClone(candidate);
    mutation(invalid);
    assert.throws(() => validate(invalid));
  }
});

test("会期・取得件数・原資料差し替えを拒否する", () => {
  const count = structuredClone(manifest);
  count.sources[0].speechCount -= 1;
  assert.throws(() => validate(candidate, count), /件数/);
  const changed = structuredClone(files);
  changed[manifest.sources[0].snapshotFile].sha256 = "0".repeat(64);
  assert.throws(() => validate(candidate, manifest, changed), /版/);
  const wrongSession = structuredClone(candidate);
  wrongSession.sessionId = "himeji-2026-4";
  assert.throws(() => validate(wrongSession));
});
