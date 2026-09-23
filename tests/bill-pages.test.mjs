import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { billDocumentForId } from "../lib/data/bill-document.ts";
import { validateBillPages } from "../lib/data/bill-page-validation.ts";

const rows = JSON.parse(readFileSync("data/candidates/himeji-2025-4-bill-pages.json", "utf8"));
const items = JSON.parse(readFileSync("data/himeji-2025-4.json", "utf8")).items;
const pages = { "R7-4_hoseiyosan_gian135-136.pdf": 29, "R7-4_gian137-163_hokoku25-28.pdf": 44, "R7-4_hoseiyosan_gian164-166.pdf": 91, "R7-4_gian167-173_shimon1-12.pdf": 43 };
const hashes = Object.fromEntries(Object.entries(pages).map(([file, count]) => [file, { pages: count, sha256: createHash("sha256").update(readFileSync(`data/sources/${file}`)).digest("hex") }]));

test("51件の本文開始ページと出典を検証し、議員提出議案を補わない", () => {
  const byId = validateBillPages(rows, items, billDocumentForId, hashes);
  assert.equal(byId.size, 51);
  assert.equal(rows.filter((row) => row.matchLevel === "number_and_full_title").length, 45);
  assert.equal(rows.filter((row) => row.matchLevel === "number_and_title_prefix").length, 6);
  assert.equal(byId.get("bill-135").page, 2);
  assert.equal(byId.get("bill-145").page, 17);
  assert.equal(byId.get("inquiry-12").page, 43);
  assert.equal(byId.has("member-bill-7"), false);
  assert.ok(rows.every((row) => row.reviewStatus === "unreviewed"));
});

test("ページの捏造、PDF差し替え、未確認候補の確認済み化を拒否する", () => {
  const badPage = structuredClone(rows);
  badPage[0].page = 100;
  assert.throws(() => validateBillPages(badPage, items, billDocumentForId, hashes), /PDFの版またはページ/);
  const changedSource = { ...hashes, [rows[0].pdfFile]: { ...hashes[rows[0].pdfFile], sha256: "0".repeat(64) } };
  assert.throws(() => validateBillPages(rows, items, billDocumentForId, changedSource), /PDFの版またはページ/);
  const premature = structuredClone(rows);
  premature[0].reviewStatus = "verified";
  assert.throws(() => validateBillPages(premature, items, billDocumentForId, hashes));
});
