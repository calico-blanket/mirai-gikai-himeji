import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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

test("保存したページ候補を原PDF本文から再抽出して一致を確かめる", () => {
  const launcher = process.platform === "win32" ? "py" : "python3";
  const args = process.platform === "win32" ? ["-3"] : [];
  const result = spawnSync(launcher, [...args, "scripts/index_himeji_committee_pdfs.py", "--check"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /Verified 12 PDFs, 63 page references and 29 bills/);
});

test("番号・ページ・PDF版・確認状態の改変を拒否する", () => {
  const launcher = process.platform === "win32" ? "py" : "python3";
  const args = process.platform === "win32" ? ["-3"] : [];
  const result = spawnSync(launcher, [...args, "tests/test_committee_index.py"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stderr, /Ran 3 tests/);
});
