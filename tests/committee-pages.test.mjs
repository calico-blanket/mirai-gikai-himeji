import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { committeeBillCount, committeePageCount, committeePagesForId } from "../lib/data/committee-pages.ts";

const candidate = JSON.parse(readFileSync("data/candidates/himeji-2025-4-committee-pages.json", "utf8"));

test("委員会PDFの番号明記ページだけを未確認候補として示す", () => {
  assert.equal(candidate.reviewStatus, "unreviewed");
  assert.equal(candidate.method, "explicit_number_on_pdf_page");
  assert.equal(candidate.sources.length, 12);
  assert.equal(committeePageCount, 63);
  assert.equal(committeeBillCount, 29);
  assert.ok(committeePagesForId("bill-135").some((row) => row.url.endsWith("20251209yosannkessanniinkaizenntaikai.pdf#page=1")));
  assert.deepEqual(committeePagesForId("member-bill-7"), []);
  assert.ok(candidate.rows.every((row) => committeePagesForId(row.itemId).some((page) => page.file === row.file && page.page === row.page)));
});
