import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { councilDataSchema, publishableCouncilDataSchema } from "../lib/data/schema.ts";

const snapshot = JSON.parse(readFileSync(new URL("../data/himeji-2025-4.json", import.meta.url), "utf8"));

test("取得した52件が既存スキーマに適合する", () => {
  const result = councilDataSchema.safeParse(snapshot);
  assert.equal(result.success, true, result.success ? "" : JSON.stringify(result.error.issues));
  assert.equal(result.data.items.length, 52);
  assert.equal(result.data.votes.length, 0);
});

test("公式HTMLの例外的な表記・概要欠測・否決が原文のまま残る", () => {
  const item145 = snapshot.items.find((item) => item.id === "bill-145");
  assert.equal(item145.officialNumber.raw, "議案145号");
  assert.equal(item145.officialNumber.value, "議案第145号");
  assert.equal(snapshot.items.find((item) => item.id === "bill-135").officialSummary.state, "not_in_official_source");
  const memberBill = snapshot.items.find((item) => item.id === "member-bill-7");
  assert.equal(memberBill.result.raw, "否決");
  assert.equal(memberBill.result.value, "rejected");
});

test("議案本文の出典は未確認のまま、各議案のitemとfieldEvidenceの状態は一致する", () => {
  for (const item of snapshot.items) {
    const expectedStatus = item.reviewStatus;
    for (const key of ["officialNumber", "title", "officialSummary", "result"]) {
      assert.equal(item.fieldEvidence[key].sourceId, snapshot.sources[0].id);
      assert.equal(item.fieldEvidence[key].retrievedAt, snapshot.sources[0].retrievedAt);
      assert.equal(item.fieldEvidence[key].reviewStatus, expectedStatus, `${item.id}.${key}`);
    }
  }
  assert.equal(snapshot.sources[0].reviewStatus, "unreviewed");
  assert.equal(publishableCouncilDataSchema.safeParse(snapshot).success, false);
});

test("出典IDを壊すと取り込み済みJSONも拒否される", () => {
  const changed = structuredClone(snapshot);
  changed.items[0].fieldEvidence.title.sourceId = "missing";
  const result = councilDataSchema.safeParse(changed);
  assert.equal(result.success, false);
  assert(result.error.issues.some((issue) => issue.path.join(".") === "items.0.fieldEvidence.title.sourceId"));
});
