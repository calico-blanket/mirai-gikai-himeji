import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { billDocumentForId } from "../lib/data/bill-document.ts";

const items = JSON.parse(readFileSync("data/himeji-2025-4.json", "utf8")).items;

test("公式の提出議案PDF番号範囲に51件を対応付け、議員提出議案は推測しない", () => {
  assert.equal(items.filter((item) => billDocumentForId(item.id)).length, 51);
  assert.equal(billDocumentForId("member-bill-7"), null);
  assert.match(billDocumentForId("bill-135").url, /gian135-136\.pdf$/);
  assert.match(billDocumentForId("bill-163").url, /gian137-163_hokoku25-28\.pdf$/);
  assert.match(billDocumentForId("bill-164").url, /gian164-166\.pdf$/);
  assert.match(billDocumentForId("inquiry-12").url, /shimon1-12\.pdf$/);
  assert.equal(billDocumentForId("bill-174"), null);
});
